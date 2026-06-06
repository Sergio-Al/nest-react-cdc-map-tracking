import {
  IsEmail,
  IsString,
  IsEnum,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsOptional,
  IsUUID,
  Matches,
  Equals,
} from 'class-validator';
import { SLUG_REGEX } from '../../tenants/slug.util';

export class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(['admin', 'dispatcher', 'driver'])
  @IsNotEmpty()
  role: 'admin' | 'dispatcher' | 'driver';

  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;
}

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  tenantId: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

/** Public self-serve signup: creates a workspace + its owner admin. */
export class SignupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  workspaceName: string;

  // The tenantId/slug the user picks (validated for format here; reserved-word
  // and uniqueness checks happen in the service).
  @Matches(SLUG_REGEX, { message: 'workspaceId must be 3-30 chars: lowercase letters, numbers, hyphens' })
  workspaceId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  password: string;

  @Equals(true, { message: 'You must accept the terms' })
  acceptedTerms: boolean;
}
