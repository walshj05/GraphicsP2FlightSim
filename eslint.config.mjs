import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";

export default defineConfig([{
    extends: [js.configs.recommended],
    ignores: ['dist/**', 'node_modules/**'],
    
    languageOptions: {
        ecmaVersion: 2025,
        sourceType: "module",
        globals: {
            ...globals.browser,
        },
    },

    rules: {
        "brace-style": ["error", "1tbs", {allowSingleLine: true}],
        "consistent-return": "error",
        curly: ["error", "multi-line", "consistent"],
        eqeqeq: ["error", "always", {null: "ignore"}],
        indent: ["error", 4],
        "no-console": "warn",
        "no-eval": "error",
        "no-global-assign": "error",
        "no-implied-eval": "error",
        "no-new": "error",
        "no-new-func": "error",
        "no-new-wrappers": "error",
        "no-shadow": "error",
        "no-undef-init": "error",
        "no-undefined": "error",
        "no-unused-vars": "error",
        "no-use-before-define": ["error", {functions: false}],
        "no-var": "error",
        "semi-spacing": "error",
        "semi-style": ["error", "last"],
        "space-before-blocks": "error",
        "space-before-function-paren": ["error", {
            anonymous: "always",
            named: "never",
            asyncArrow: "always",
        }],
        "space-unary-ops": "error",
    },
}]);