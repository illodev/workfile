import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { sep } from "node:path";

/**
 * The path the watcher actually watched, which is not the path the test built.
 *
 * `start()` resolves the root through `realpath.native` on purpose: macOS
 * answers `/private/var` for a `tmpdir()` that says `/var`, and a Windows
 * runner's TEMP arrives as an 8.3 short name. Composing the path here instead
 * of reading it back passed on Linux and failed on four other jobs.
 */
function match(calls: string[], relative: string) {
    const suffix = `${sep}${relative.split("/").join(sep)}`;
    return calls.find((path) => path.endsWith(suffix));
}

/**
 * A stand-in for `fs.watch` that answers the probe, hands back every directory
 * handle so a failure can be delivered on purpose, and places change events on
 * demand.
 *
 * [[T-0113]] measured that neither branch of the watcher's dropped-signal
 * handling can be reached on Linux — deleting a watched directory reports a
 * named `rename` and never fires `error` — and twenty-six Windows jobs never
 * produced one either. Waiting for a platform to break a handle is not a plan;
 * injecting the primitive is the same technique T-0140 and T-0142 used.
 *
 * `deliver` extends that to the coalescer. Whether a burst of writes reaches
 * the watcher inside one quiet period is a fact about the runner, not about
 * the grouping: no platform promises it, and [[T-0179]] measured gaps past
 * 4.8 s on a loaded Windows runner. Stating the events here takes the
 * operating system out of a question that was never its to answer.
 */
export function stubWatch() {
    const failOn = new Set<string>();
    const calls: string[] = [];
    const handles = new Map<string, any>();
    const listeners = new Map<string, any>();
    const watch = (path: string, _options: any, listener: any) => {
        calls.push(path);
        if (failOn.has(path))
            throw Object.assign(new Error("EPERM"), { code: "EPERM" });
        const handle: any = new EventEmitter();
        handle.close = () => undefined;
        handles.set(path, handle);
        listeners.set(path, listener);
        // The probe writes a file and waits half a second for a notification;
        // without one every test here would degrade before it started.
        if (path.endsWith(`${sep}watch`))
            setTimeout(() => listener("change", "probe"), 5);
        return handle;
    };
    return {
        watch,
        calls,
        handles,
        failOn,
        /**
         * One event, on the handle covering `relative`.
         *
         * Synchronous by design: a loop that calls this never yields, so no
         * timer can fire between two events however loaded the machine is, and
         * the burst is a burst by construction rather than by luck.
         */
        deliver(relative: string, name: string) {
            const path = match(calls, relative);
            // A delivery nobody is listening to is an assertion that passes for
            // the wrong reason.
            assert.ok(path, `nothing watched ${relative} in ${calls.join(", ")}`);
            const listener = listeners.get(path);
            assert.ok(listener, `nothing is listening on ${relative}`);
            listener("change", name);
        }
    };
}

export function watched(stub: any, relative: string) {
    const found = match(stub.calls, relative);
    assert.ok(found, `nothing watched ${relative} in ${stub.calls.join(", ")}`);
    return found;
}
