import { Moon, Rows3, Rows4, Settings, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog";
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldGroup,
    FieldTitle
} from "@/components/ui/field";

/** One value a setting can take, with the icon that used to stand for it. */
interface Choice {
    value: string;
    label: string;
    icon: typeof Sun;
}

const THEMES: readonly Choice[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon }
];

/** `Rows3` draws the taller rows, so it is the comfortable end. */
const DENSITIES: readonly Choice[] = [
    { value: "compact", label: "Compact", icon: Rows4 },
    { value: "comfortable", label: "Comfortable", icon: Rows3 }
];

/** A closed set of values, shown all at once the way History shows its
 *  changelog visibilities — a select would hide one of two options behind
 *  a click, and leave the row without the icons the header carried. */
function Setting({
    label,
    description,
    value,
    options,
    onChange
}: {
    label: string;
    description: string;
    value: string;
    options: readonly Choice[];
    onChange: (value: string) => void;
}) {
    return (
        <Field orientation="horizontal">
            <FieldContent>
                <FieldTitle>{label}</FieldTitle>
                <FieldDescription>{description}</FieldDescription>
            </FieldContent>
            <ButtonGroup aria-label={label} className="shrink-0">
                {options.map((option) => {
                    const Icon = option.icon;
                    const on = option.value === value;
                    return (
                        <Button
                            key={option.value}
                            type="button"
                            size="sm"
                            variant={on ? "default" : "outline"}
                            aria-pressed={on}
                            onClick={() => onChange(option.value)}
                        >
                            <Icon aria-hidden="true" />
                            {option.label}
                        </Button>
                    );
                })}
            </ButtonGroup>
        </Field>
    );
}

/**
 * The preferences that were two icon buttons in the app header.
 *
 * It renders its own trigger, so the header holds one element and Radix
 * returns focus to the gear when the dialog closes — the restore the command
 * palette has to fake with a ref, because a keybinding can open it from
 * anywhere.
 *
 * It owns neither value. Both stay in the shell, next to the effects that
 * stamp the root element and write localStorage; a theme that needed a dialog
 * mounted to exist would be worse than the buttons this replaces.
 */
export function SettingsDialog({
    dark,
    onDarkChange,
    comfortable,
    onComfortableChange
}: {
    dark: boolean;
    onDarkChange: (dark: boolean) => void;
    comfortable: boolean;
    onComfortableChange: (comfortable: boolean) => void;
}) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Settings"
                    aria-label="Settings"
                    className="shrink-0"
                >
                    <Settings aria-hidden="true" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Settings</DialogTitle>
                    <DialogDescription>
                        Kept in this browser. Nothing here is written to the
                        workspace.
                    </DialogDescription>
                </DialogHeader>
                <FieldGroup className="gap-5">
                    <Setting
                        label="Theme"
                        description="Taken from the system on the first visit."
                        value={dark ? "dark" : "light"}
                        options={THEMES}
                        onChange={(next) => onDarkChange(next === "dark")}
                    />
                    <Setting
                        label="Row density"
                        description="Row height in the tables and the boards."
                        value={comfortable ? "comfortable" : "compact"}
                        options={DENSITIES}
                        onChange={(next) =>
                            onComfortableChange(next === "comfortable")
                        }
                    />
                </FieldGroup>
            </DialogContent>
        </Dialog>
    );
}
