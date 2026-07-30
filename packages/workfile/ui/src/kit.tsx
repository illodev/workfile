import type { CSSProperties, ReactNode } from "react";
import { Dialog as RadixDialog, DropdownMenu } from "radix-ui";

/**
 * The interactive primitives of the design system: the pieces that need real
 * behaviour (focus trapping, typeahead, dismissal) borrow it from Radix and
 * nothing else — appearance comes entirely from `styles.css`.
 */

export interface ChipOption {
    value: string;
    label?: string;
    /** Optional swatch colour, e.g. `statusColor("doing")`. */
    color?: string;
}

/**
 * A filter chip that opens a menu: `estado: todos` in the spec. The empty
 * value means "all", renders dimmed and drops the chip out of `.is-on`.
 */
export function ChipSelect({
    label,
    value,
    options,
    allLabel = "all",
    onChange
}: {
    label: string;
    value: string;
    options: ChipOption[];
    allLabel?: string;
    onChange: (value: string) => void;
}) {
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <button
                    type="button"
                    className={value ? "chip is-on" : "chip"}
                    aria-label={label}
                >
                    {label}
                    <span className="chip-value">{value || allLabel}</span>
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    className="menu"
                    align="start"
                    sideOffset={4}
                >
                    <DropdownMenu.Item
                        className="menu-item"
                        data-checked={!value || undefined}
                        onSelect={() => onChange("")}
                    >
                        {allLabel}
                    </DropdownMenu.Item>
                    {options.map((option) => (
                        <DropdownMenu.Item
                            key={option.value}
                            className="menu-item"
                            data-checked={value === option.value || undefined}
                            onSelect={() => onChange(option.value)}
                        >
                            {option.color ? (
                                <span
                                    className="dot"
                                    style={{ color: option.color }}
                                    aria-hidden="true"
                                />
                            ) : null}
                            {option.label ?? option.value}
                        </DropdownMenu.Item>
                    ))}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}

/** An on/off chip: `cerradas: sí` in the spec. */
export function ChipToggle({
    label,
    on,
    onLabel = "yes",
    offLabel = "no",
    onChange
}: {
    label: string;
    on: boolean;
    onLabel?: string;
    offLabel?: string;
    onChange: (on: boolean) => void;
}) {
    return (
        <button
            type="button"
            className={on ? "chip is-on" : "chip"}
            aria-pressed={on}
            onClick={() => onChange(!on)}
        >
            {label}
            <span className="chip-value">{on ? onLabel : offLabel}</span>
        </button>
    );
}

/** Modal dialog carrying the spec's card look; content scrolls, chrome stays. */
export function AppDialog({
    title,
    open,
    onClose,
    children,
    footer,
    width
}: {
    title: ReactNode;
    open: boolean;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
    width?: number;
}) {
    const style: CSSProperties | undefined = width ? { width } : undefined;
    return (
        <RadixDialog.Root
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <RadixDialog.Portal>
                <RadixDialog.Overlay className="dialog-overlay">
                    <RadixDialog.Content
                        className="dialog"
                        style={style}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <RadixDialog.Title asChild>
                            <div className="dialog-head">{title}</div>
                        </RadixDialog.Title>
                        <div className="dialog-body">{children}</div>
                        {footer ? (
                            <div className="dialog-foot">{footer}</div>
                        ) : null}
                    </RadixDialog.Content>
                </RadixDialog.Overlay>
            </RadixDialog.Portal>
        </RadixDialog.Root>
    );
}

/** Labelled form field wrapper for the editors and dialogs. */
export function Field({
    label,
    children
}: {
    label: ReactNode;
    children: ReactNode;
}) {
    return (
        <label className="field">
            <span className="field-label">{label}</span>
            {children}
        </label>
    );
}
