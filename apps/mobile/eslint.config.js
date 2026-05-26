module.exports = [
  {
    ignores: ["node_modules", ".expo", "dist", "supabase/functions"],
  },
  {
    rules: {
      "no-unused-vars": "off",
      "semi": ["error", "always"],
      "quotes": ["error", "single", { "avoidEscape": true }],
      "prefer-const": "error",
      "no-duplicate-imports": "error",
    },
  }
];
