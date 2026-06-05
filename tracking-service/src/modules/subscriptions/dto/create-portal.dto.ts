import { IsOptional, IsUrl } from 'class-validator';

export class CreatePortalDto {
  // Optional override; falls back to the server-configured return URL.
  @IsOptional()
  @IsUrl({ require_tld: false })
  returnUrl?: string;
}
