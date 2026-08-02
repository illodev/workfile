import { type ReactNode } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetDescription,
    SheetHeader,
    SheetTitle
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * The overlay a record is read in.
 *
 * Cards have opened this way since the rail became a drawer; memory records
 * grew a panel inside their own lanes instead, which was a second answer to
 * the same question and cost the lanes their width exactly when the reader
 * needed it. This is that drawer, written once.
 *
 * It is an overlay, not a pane: the view underneath never reflows and stays
 * interactive (`modal={false}` also means no dimmer and no focus trap). The
 * content is composed from the sheet primitives directly because the registry
 * SheetContent's internal portal ignores `forceMount` — and the drawer must
 * stay mounted while closed so an open form survives a toggle.
 */
export function RecordDrawer({
    open,
    expanded,
    label,
    description,
    onOpenChange,
    onExpandedChange,
    holdOpen,
    children
}: {
    open: boolean;
    expanded: boolean;
    /** Accessible name; the visible heading belongs to the content. */
    label: string;
    description: string;
    onOpenChange: (open: boolean) => void;
    onExpandedChange: (expanded: boolean) => void;
    /**
     * Returns true while a dismissal must be refused — a form holding unsaved
     * input, a dialog raised from inside the drawer, or the deferred echo of
     * the click that just opened it.
     *
     * Radix defers its pointer-down-outside dispatch until after the click
     * handlers have run, so without the last of those a record-opening click
     * would open the drawer and then be dismissed by its own, late-arriving
     * outside event.
     */
    holdOpen?: () => boolean;
    children: ReactNode;
}) {
    const refuse = (event: { preventDefault: () => void }) => {
        if (holdOpen?.()) event.preventDefault();
    };
    return (
        <Sheet open={open} modal={false} onOpenChange={onOpenChange}>
            <SheetPrimitive.Portal forceMount>
                <SheetPrimitive.Content
                    forceMount
                    className={cn(
                        "fixed inset-y-0 right-0 z-50 flex h-full flex-col bg-background shadow-lg transition-[width] duration-200 ease-in-out",
                        "data-[state=closed]:hidden data-[state=open]:animate-in data-[state=open]:duration-300 data-[state=open]:slide-in-from-right",
                        expanded
                            ? "w-[min(1100px,92vw)]"
                            : "w-[480px] max-w-[92vw]"
                    )}
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    onEscapeKeyDown={refuse}
                    onInteractOutside={refuse}
                    onPointerDownOutside={refuse}
                >
                    <SheetHeader className="flex-row items-center justify-end gap-1 border-b border-l px-2 py-1.5">
                        <SheetTitle className="sr-only">{label}</SheetTitle>
                        <SheetDescription className="sr-only">
                            {description}
                        </SheetDescription>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-pressed={expanded}
                            title={expanded ? `Minimize ${label}` : `Maximize ${label}`}
                            aria-label={
                                expanded ? `Minimize ${label}` : `Maximize ${label}`
                            }
                            onClick={() => onExpandedChange(!expanded)}
                        >
                            {expanded ? (
                                <Minimize2 aria-hidden="true" />
                            ) : (
                                <Maximize2 aria-hidden="true" />
                            )}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            title={`Close ${label}`}
                            aria-label={`Close ${label}`}
                            onClick={() => onOpenChange(false)}
                        >
                            <X aria-hidden="true" />
                        </Button>
                    </SheetHeader>
                    <div className="flex min-h-0 flex-1 flex-col *:min-w-0 *:grow">
                        {children}
                    </div>
                </SheetPrimitive.Content>
            </SheetPrimitive.Portal>
        </Sheet>
    );
}
