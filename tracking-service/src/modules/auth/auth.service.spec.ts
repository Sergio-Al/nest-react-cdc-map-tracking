import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { CachedUser } from '../sync/entities/cached-user.entity';
import { RedisService } from '../redis/redis.service';
import { SettingsService } from '../settings/settings.service';
import { SubscriptionLifecycleService } from '../subscriptions/subscription-lifecycle.service';
import { TenantsService } from '../tenants/tenants.service';

const PASSWORD = 'admin123';
const SETTINGS = { timezone: 'America/La_Paz', locale: 'es' };

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: { findOne: jest.Mock; find: jest.Mock; create: jest.Mock; save: jest.Mock };
  let jwtService: { sign: jest.Mock };
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock; getJson: jest.Mock; setJson: jest.Mock };
  let settingsService: { getEffective: jest.Mock };
  let subscriptionLifecycle: { startTrial: jest.Mock };
  let tenantsService: { create: jest.Mock; isAvailable: jest.Mock };

  let hashedPassword: string;

  function makeUser(overrides: Partial<CachedUser> = {}): CachedUser {
    return {
      id: 'user-1',
      email: 'admin@tenant1.com',
      password: hashedPassword,
      name: 'Admin',
      role: 'admin',
      tenantId: 'tenant-1',
      driverId: null,
      isActive: true,
      ...overrides,
    } as CachedUser;
  }

  beforeAll(async () => {
    // Low cost factor keeps the suite fast; compare() honors the hash's own cost.
    hashedPassword = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(async () => {
    userRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((u) => u),
      save: jest.fn(async (u) => u),
    };
    jwtService = { sign: jest.fn().mockReturnValue('signed-jwt') };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn().mockResolvedValue(undefined),
    };
    settingsService = { getEffective: jest.fn().mockResolvedValue(SETTINGS) };
    subscriptionLifecycle = { startTrial: jest.fn().mockResolvedValue(undefined) };
    tenantsService = {
      create: jest.fn().mockResolvedValue(undefined),
      isAvailable: jest.fn().mockResolvedValue({ available: true }),
    };

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'auth.refreshExpiresInMs') return 604_800_000;
        if (key === 'auth.jwtExpiresIn') return '1h';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(CachedUser, 'cacheDb'), useValue: userRepo },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: RedisService, useValue: redis },
        { provide: SettingsService, useValue: settingsService },
        { provide: SubscriptionLifecycleService, useValue: subscriptionLifecycle },
        { provide: TenantsService, useValue: tenantsService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  // ── login ────────────────────────────────────────────────

  describe('login', () => {
    const dto = { email: 'admin@tenant1.com', password: PASSWORD, tenantId: 'tenant-1' };

    it('returns a token bundle with user (sans password) and effective settings', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());

      const result = await service.login(dto as any);

      expect(result.accessToken).toBe('signed-jwt');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.user).toEqual(
        expect.objectContaining({ id: 'user-1', tenantId: 'tenant-1', role: 'admin' }),
      );
      expect(result.user).not.toHaveProperty('password');
      expect(result.settings).toEqual(SETTINGS);
      // JWT carries tenant + role for downstream guards
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'user-1', tenantId: 'tenant-1', role: 'admin' }),
      );
      // Refresh token stored in Redis with the configured TTL (ms → s)
      expect(redis.set).toHaveBeenCalledWith(
        `refresh:${result.refreshToken}`,
        'user-1',
        604_800,
      );
    });

    it('rejects an unknown user with invalidCredentials', async () => {
      await expect(service.login(dto as any)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a wrong password with invalidCredentials', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());

      await expect(
        service.login({ ...dto, password: 'wrong' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an inactive user before checking the password', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ isActive: false }));

      await expect(service.login(dto as any)).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'auth.userInactive' }),
      });
    });

    it('scopes the user lookup by tenant', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());

      await service.login(dto as any);

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { email: dto.email, tenantId: 'tenant-1' },
      });
    });
  });

  // ── register ─────────────────────────────────────────────

  describe('register', () => {
    const dto = {
      email: 'new@tenant1.com',
      password: 'secret123',
      name: 'Nuevo',
      role: 'operator',
      tenantId: 'tenant-1',
    };

    it('creates the user with a hashed password and returns it without the hash', async () => {
      const result = await service.register(dto as any);

      const savedUser = userRepo.save.mock.calls[0][0];
      expect(savedUser.password).not.toBe(dto.password);
      expect(await bcrypt.compare(dto.password, savedUser.password)).toBe(true);
      expect(result).not.toHaveProperty('password');
      expect(result).toMatchObject({ email: dto.email, tenantId: 'tenant-1', isActive: true });
    });

    it('rejects a duplicate email in the same tenant', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ email: dto.email }));

      await expect(service.register(dto as any)).rejects.toThrow(ConflictException);
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('translates the unique-violation race (PG 23505) into a Conflict', async () => {
      const driverError: any = new Error('duplicate key');
      driverError.code = '23505';
      userRepo.save.mockRejectedValue(new QueryFailedError('INSERT', [], driverError));

      await expect(service.register(dto as any)).rejects.toThrow(ConflictException);
    });

    it('starts the reverse trial for admin signups', async () => {
      await service.register({ ...dto, role: 'admin' } as any);

      expect(subscriptionLifecycle.startTrial).toHaveBeenCalledWith('tenant-1');
    });

    it('does not start a trial for non-admin roles', async () => {
      await service.register(dto as any);

      expect(subscriptionLifecycle.startTrial).not.toHaveBeenCalled();
    });

    it('does not block account creation when the trial start fails', async () => {
      subscriptionLifecycle.startTrial.mockRejectedValue(new Error('billing down'));

      await expect(service.register({ ...dto, role: 'admin' } as any)).resolves.toMatchObject({
        email: dto.email,
      });
    });
  });

  // ── signup (self-serve workspace) ────────────────────────

  describe('signup', () => {
    const dto = {
      workspaceId: 'Mi-Empresa',
      workspaceName: 'Mi Empresa SRL',
      email: 'owner@miempresa.com',
      password: 'secret123',
      name: 'Dueño',
    };

    it('rejects reserved workspace ids before claiming anything', async () => {
      await expect(service.signup({ ...dto, workspaceId: 'admin' } as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(tenantsService.create).not.toHaveBeenCalled();
    });

    it('claims the lowercased workspace, creates the owner admin and auto-logs in', async () => {
      const result = await service.signup(dto as any);

      expect(tenantsService.create).toHaveBeenCalledWith({
        id: 'mi-empresa',
        name: dto.workspaceName,
        ownerEmail: dto.email,
      });
      const savedUser = userRepo.save.mock.calls[0][0];
      expect(savedUser).toMatchObject({ role: 'admin', tenantId: 'mi-empresa', isActive: true });
      expect(subscriptionLifecycle.startTrial).toHaveBeenCalledWith('mi-empresa');
      expect(result.accessToken).toBe('signed-jwt');
      expect(result.refreshToken).toEqual(expect.any(String));
    });

    it('completes signup even when the trial start fails (best-effort)', async () => {
      subscriptionLifecycle.startTrial.mockRejectedValue(new Error('billing down'));

      await expect(service.signup(dto as any)).resolves.toMatchObject({
        accessToken: 'signed-jwt',
      });
    });
  });

  // ── createDriverLogin ────────────────────────────────────

  describe('createDriverLogin', () => {
    const input = {
      tenantId: 'tenant-1',
      driverId: 'drv-1',
      name: 'Juan',
      email: 'juan@tenant1.com',
      password: 'secret123',
    };

    it('creates a driver-role login linked to the driver', async () => {
      const result = await service.createDriverLogin(input);

      expect(result).toMatchObject({ role: 'driver', driverId: 'drv-1', tenantId: 'tenant-1' });
      expect(result).not.toHaveProperty('password');
    });

    it('rejects when the email is already taken in the tenant', async () => {
      userRepo.findOne.mockResolvedValueOnce(makeUser({ email: input.email }));

      await expect(service.createDriverLogin(input)).rejects.toThrow(ConflictException);
    });

    it('rejects when the driver already has a login (one login per driver)', async () => {
      userRepo.findOne
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce(makeUser({ driverId: 'drv-1', role: 'driver' })); // driver check

      await expect(service.createDriverLogin(input)).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'auth.driverLoginExists' }),
      });
    });
  });

  // ── refreshTokens / logout ───────────────────────────────

  describe('refreshTokens', () => {
    it('rotates the refresh token for an active user', async () => {
      redis.get.mockResolvedValue('user-1');
      userRepo.findOne.mockResolvedValue(makeUser());

      const result = await service.refreshTokens('old-token');

      expect(redis.del).toHaveBeenCalledWith('refresh:old-token');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.refreshToken).not.toBe('old-token');
      expect(result.accessToken).toBe('signed-jwt');
    });

    it('rejects an unknown/expired refresh token', async () => {
      await expect(service.refreshTokens('bogus')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when the user has been deactivated since', async () => {
      redis.get.mockResolvedValue('user-1');
      userRepo.findOne.mockResolvedValue(makeUser({ isActive: false }));

      await expect(service.refreshTokens('old-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('deletes the refresh token from Redis', async () => {
      await service.logout('user-1', 'the-token');

      expect(redis.del).toHaveBeenCalledWith('refresh:the-token');
    });
  });

  // ── validateUser (per-request JWT validation) ────────────

  describe('validateUser', () => {
    const payload = { sub: 'user-1', tenantId: 'tenant-1', role: 'admin' } as any;

    it('serves the user from the Redis cache without hitting PG', async () => {
      const { password, ...safe } = makeUser();
      redis.getJson.mockResolvedValue(safe);

      const result = await service.validateUser(payload);

      expect(result).toEqual(safe);
      expect(userRepo.findOne).not.toHaveBeenCalled();
    });

    it('falls back to PG and caches the user without the password', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());

      const result = await service.validateUser(payload);

      expect(result).toMatchObject({ id: 'user-1' });
      expect(redis.setJson).toHaveBeenCalledWith(
        'authuser:user-1',
        expect.not.objectContaining({ password: expect.anything() }),
        60,
      );
    });

    it('returns null for an inactive user and does not cache it', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ isActive: false }));

      const result = await service.validateUser(payload);

      expect(result).toBeNull();
      expect(redis.setJson).not.toHaveBeenCalled();
    });
  });

  // ── checkWorkspace / driverIdsWithLogin ──────────────────

  describe('checkWorkspace', () => {
    it('rejects malformed slugs', async () => {
      await expect(service.checkWorkspace('ab')).resolves.toEqual({
        available: false,
        reason: 'invalid',
      });
    });

    it('rejects reserved slugs', async () => {
      await expect(service.checkWorkspace('ADMIN')).resolves.toEqual({
        available: false,
        reason: 'reserved',
      });
    });

    it('delegates valid slugs to the tenants service', async () => {
      tenantsService.isAvailable.mockResolvedValue({ available: false, reason: 'taken' });

      await expect(service.checkWorkspace('mi-empresa')).resolves.toEqual({
        available: false,
        reason: 'taken',
      });
      expect(tenantsService.isAvailable).toHaveBeenCalledWith('mi-empresa');
    });
  });

  describe('driverIdsWithLogin', () => {
    it('returns the set of driver ids that have a login, skipping null driverIds', async () => {
      userRepo.find.mockResolvedValue([
        { driverId: 'drv-1' },
        { driverId: null },
        { driverId: 'drv-2' },
      ]);

      const result = await service.driverIdsWithLogin('tenant-1');

      expect(result).toEqual(new Set(['drv-1', 'drv-2']));
      expect(userRepo.find).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', role: 'driver' },
        select: ['driverId'],
      });
    });
  });
});
