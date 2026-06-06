import { Injectable, Logger, UnauthorizedException, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { CachedUser } from '../sync/entities/cached-user.entity';
import { RedisService } from '../redis/redis.service';
import { SettingsService } from '../settings/settings.service';
import { SubscriptionLifecycleService } from '../subscriptions/subscription-lifecycle.service';
import { TenantsService, Availability } from '../tenants/tenants.service';
import { isReservedSlug, isValidSlug } from '../tenants/slug.util';
import { RegisterDto, LoginDto, SignupDto } from './dto/auth.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(CachedUser, 'cacheDb')
    private userRepository: Repository<CachedUser>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
    private settingsService: SettingsService,
    private subscriptionLifecycle: SubscriptionLifecycleService,
    private tenantsService: TenantsService,
  ) {}

  /**
   * Public self-serve signup. Workspace-first: atomically claim the workspace
   * id (tenants PK is the race guard), create the owner ADMIN, start the
   * reverse trial, and auto-login by returning the same token bundle as login.
   */
  async signup(dto: SignupDto) {
    const tenantId = dto.workspaceId.toLowerCase();
    if (isReservedSlug(tenantId)) {
      throw new BadRequestException({ errorCode: 'auth.workspaceReserved', args: { id: tenantId } });
    }

    // Claim the workspace first — the PK makes concurrent claims race-safe and
    // throws auth.workspaceTaken on conflict.
    await this.tenantsService.create({
      id: tenantId,
      name: dto.workspaceName,
      ownerEmail: dto.email,
    });

    // Create the owner admin.
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = this.userRepository.create({
      id: randomUUID(),
      email: dto.email,
      password: hashedPassword,
      name: dto.name,
      role: 'admin',
      tenantId,
      driverId: null,
      isActive: true,
    });
    await this.userRepository.save(user);

    // Open the 14-day reverse trial (idempotent). Best-effort: a billing hiccup
    // must not strand a just-created workspace mid-signup.
    try {
      await this.subscriptionLifecycle.startTrial(tenantId);
    } catch (err) {
      this.logger.warn(`startTrial failed for tenant=${tenantId}: ${(err as Error).message}`);
    }

    // Auto-login.
    return this.generateTokenPair(user);
  }

  /** Workspace-id availability for the signup form's live check. */
  async checkWorkspace(id: string): Promise<Availability> {
    const slug = (id || '').toLowerCase();
    if (!isValidSlug(slug)) return { available: false, reason: 'invalid' };
    if (isReservedSlug(slug)) return { available: false, reason: 'reserved' };
    return this.tenantsService.isAvailable(slug);
  }

  async register(dto: RegisterDto) {
    // Check if user already exists
    const existing = await this.userRepository.findOne({
      where: { email: dto.email, tenantId: dto.tenantId },
    });

    if (existing) {
      throw new ConflictException({ errorCode: 'auth.userAlreadyExists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Create user
    const user = this.userRepository.create({
      id: randomUUID(),
      email: dto.email,
      password: hashedPassword,
      name: dto.name,
      role: dto.role,
      tenantId: dto.tenantId,
      driverId: dto.driverId || null,
      isActive: true,
    });

    await this.userRepository.save(user);

    // Owner signup creates the workspace → open the reverse trial. Idempotent
    // (no-op if the tenant already has a subscription) and best-effort: a
    // billing hiccup must never block account creation.
    if (dto.role === 'admin') {
      try {
        await this.subscriptionLifecycle.startTrial(dto.tenantId);
      } catch (err) {
        this.logger.warn(`startTrial failed for tenant=${dto.tenantId}: ${(err as Error).message}`);
      }
    }

    // Return user without password
    const { password, ...result } = user;
    return result;
  }

  async login(loginDto: LoginDto) {
    const { email, password, tenantId } = loginDto;

    // Find user
    const user = await this.userRepository.findOne({
      where: { email, tenantId },
    });

    if (!user) {
      throw new UnauthorizedException({ errorCode: 'auth.invalidCredentials' });
    }

    if (!user.isActive) {
      throw new UnauthorizedException({ errorCode: 'auth.userInactive' });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException({ errorCode: 'auth.invalidCredentials' });
    }

    // Generate token pair
    return this.generateTokenPair(user);
  }

  async refreshTokens(refreshToken: string) {
    // Validate refresh token from Redis
    const userId = await this.redisService.get(`refresh:${refreshToken}`);

    if (!userId) {
      throw new UnauthorizedException({ errorCode: 'auth.invalidRefreshToken' });
    }

    // Find user
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({ errorCode: 'auth.userNotFoundOrInactive' });
    }

    // Delete old refresh token
    await this.redisService.del(`refresh:${refreshToken}`);

    // Generate new token pair
    return this.generateTokenPair(user);
  }

  async logout(userId: string, refreshToken: string) {
    // Delete refresh token from Redis
    await this.redisService.del(`refresh:${refreshToken}`);
    return { message: 'Logged out successfully' };
  }

  async generateTokenPair(user: CachedUser) {
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      driverId: user.driverId || undefined,
    };

    // Generate access token
    const accessToken = this.jwtService.sign(payload);

    // Generate refresh token
    const refreshToken = randomUUID();
    const refreshExpiresInMs = this.configService.get<number>('auth.refreshExpiresInMs') ?? 604800000;

    // Store refresh token in Redis
    await this.redisService.set(
      `refresh:${refreshToken}`,
      user.id,
      Math.floor(refreshExpiresInMs / 1000),
    );

    // Resolve effective settings so the client boots with the right tz/locale.
    const settings = await this.settingsService.getEffective(user.id, user.tenantId);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.configService.get<string>('auth.jwtExpiresIn'),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        driverId: user.driverId,
      },
      settings,
    };
  }

  async validateUser(payload: JwtPayload): Promise<CachedUser | null> {
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      return null;
    }

    return user;
  }

  async getUserById(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException({ errorCode: 'auth.userNotFound' });
    }

    const { password, ...result } = user;
    const settings = await this.settingsService.getEffective(user.id, user.tenantId);
    return { ...result, settings };
  }
}
