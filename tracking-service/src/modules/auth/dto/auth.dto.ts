import { IsEmail, IsString, IsEnum, IsNotEmpty, MinLength, IsOptional, IsUUID } from 'class-validator';

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
