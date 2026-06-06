import { IsEmail, IsString, IsNotEmpty, MinLength } from 'class-validator';

/** Admin-entered credentials to create a `role:'driver'` login for a driver. */
export class CreateDriverLoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  password: string;
}
