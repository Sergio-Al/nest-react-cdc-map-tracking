import { Languages, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth.store";
import { useUpdateUserSettings } from "@/hooks/api/useSettings";

export function LanguageToggle() {
  const { i18n, t } = useTranslation("common");
  const updateSettings = useUpdateUserSettings();
  const current = (i18n.language?.split("-")[0] ?? "es") as SupportedLanguage;

  const choose = (lng: SupportedLanguage) => {
    void i18n.changeLanguage(lng);
    // Persist for authenticated users so the choice follows them across devices.
    if (useAuthStore.getState().isAuthenticated) updateSettings.mutate({ locale: lng });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("language.label")}
          title={t("language.label")}
        >
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-40">
        {SUPPORTED_LANGUAGES.map((lng) => {
          const active = current === lng;
          return (
            <DropdownMenuItem
              key={lng}
              onSelect={() => choose(lng)}
              className="flex items-center justify-between"
            >
              <span>{t(`language.${lng}`)}</span>
              <Check
                className={cn(
                  "h-4 w-4 transition-opacity",
                  active ? "opacity-100" : "opacity-0",
                )}
              />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
