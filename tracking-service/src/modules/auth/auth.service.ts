import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { CachedUser } from '../sync/entities/cached-user.entity';
import { RedisService } from '../redis/redis.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(CachedUser, 'cacheDb')
    private userRepository: Repository<CachedUser>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
  ) {}

  async register(dto: RegisterDto) {
    // Check if user already exists
    const existing = await this.userRepository.findOne({
      where: { email: dto.email, tenantId: dto.tenantId },
    });

    if (existing) {
      throw new ConflictException('User with this email already exists in this tenant');
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
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate token pair
    return this.generateTokenPair(user);
  }

  async refreshTokens(refreshToken: string) {
    // Validate refresh token from Redis
    const userId = await this.redisService.get(`refresh:${refreshToken}`);

    if (!userId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Find user
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
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
      throw new NotFoundException('User not found');
    }

    const { password, ...result } = user;
    return result;
  }
}
