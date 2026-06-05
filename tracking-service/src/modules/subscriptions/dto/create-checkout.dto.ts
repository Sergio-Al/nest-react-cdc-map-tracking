import { IsString, IsOptional, IsUrl, MaxLength } from 'class-validator';

export class CreateCheckoutDto {
  @IsString()
  @MaxLength(20)
  planCode!: string;

  // Optional overrides; fall back to the server-configured URLs.
  @IsOptional()
  @IsUrl({ require_tld: false })
  successUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  cancelUrl?: string;
}
