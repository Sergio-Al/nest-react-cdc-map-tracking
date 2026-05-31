import { Moon, Sun, Monitor, Check } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type ThemeChoice = "light" | "dark" | "system";

const CHOICES: { id: ThemeChoice; icon: typeof Sun }[] = [
  { id: "light", icon: Sun },
  { id: "dark", icon: Moon },
  { id: "system", icon: Monitor },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation("common");
  const current = (theme as ThemeChoice | undefined) ?? "system";
  // Trigger icon reflects the *choice* — System shows Monitor regardless of the
  // resolved theme, so the user can tell at a glance which mode they picked.
  const TriggerIcon =
    current === "system" ? Monitor : current === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("theme.label")}
          title={t("theme.label")}
        >
          <TriggerIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-40">
        {CHOICES.map(({ id, icon: Icon }) => {
          const active = current === id;
          return (
            <DropdownMenuItem
              key={id}
              onSelect={() => setTheme(id)}
              className="flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-mc-text-dim" />
                {t(`theme.${id}`)}
              </span>
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
