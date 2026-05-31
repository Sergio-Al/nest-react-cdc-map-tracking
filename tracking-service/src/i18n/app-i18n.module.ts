import { Module } from '@nestjs/common';
import * as path from 'path';
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';

/**
 * Wraps `I18nModule.forRoot` with this project's defaults:
 * - Spanish as the fallback (this is a Bolivia-focused fleet).
 * - Locale JSON files live in `src/i18n/` (copied to `dist/i18n/` on build
 *   via `nest-cli.json` assets so __dirname resolution works in prod).
 * - Resolution precedence: `?lang=` query → `Accept-Language` → `x-lang` header
 *   → fallback. The frontend axios client sends `Accept-Language` on every
 *   request (see `fleetview-live-main/src/lib/axios.ts`).
 */
@Module({
  imports: [
    I18nModule.forRoot({
      fallbackLanguage: 'es',
      loaderOptions: {
        path: path.join(__dirname, '/'),
        watch: true,
      },
      typesOutputPath: path.join(
        process.cwd(),
        'src/i18n/generated/i18n.generated.ts',
      ),
      resolvers: [
        { use: QueryResolver, options: ['lang', 'l'] },
        AcceptLanguageResolver,
        new HeaderResolver(['x-lang']),
      ],
    }),
  ],
})
export class AppI18nModule {}
