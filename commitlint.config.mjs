// House style, not Conventional Commits: headers are narrative sentences
// ("Upgrade: one command resyncs every generated surface after a bump"), the
// changelog is generated from Workfile's own fragments, and `npm version`
// writes bare-version headers like `0.1.4` through this hook. The built-in
// `header-case: sentence-case` would reject README, MCP and T-0022 — real
// history — so the opening constraint is a single custom rule instead.
const OPENER = /^[A-Z0-9]/;

export default {
    plugins: [
        {
            rules: {
                "header-opens-upper": ({ header }) => [
                    OPENER.test(header ?? ""),
                    "header must open with an uppercase letter or a digit (version bumps like `0.1.4`)"
                ]
            }
        }
    ],
    rules: {
        "header-max-length": [2, "always", 100],
        "header-full-stop": [2, "never", "."],
        "header-opens-upper": [2, "always"],
        "body-leading-blank": [2, "always"]
    }
};
