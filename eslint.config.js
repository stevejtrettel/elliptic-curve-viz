import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },

  ...tseslint.configs.recommended,

  // ARCHITECTURAL BOUNDARY (DESIGN.md §4): src/math is pure mathematics.
  // No rendering libraries, no outer layers. This rule IS the guarantee.
  {
    files: ['src/math/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['three', 'three/*', 'three-gpu-pathtracer', 'three-gpu-pathtracer/*'],
              message: 'src/math is pure: no rendering dependencies (DESIGN.md §4).',
            },
            {
              group: ['@/geometry', '@/geometry/*', '@/studio', '@/studio/*', '@/io', '@/io/*'],
              message: 'src/math must not import outer layers (DESIGN.md §4).',
            },
          ],
        },
      ],
    },
  },

  // src/geometry may use three + math, but not the studio layer.
  {
    files: ['src/geometry/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/studio', '@/studio/*'],
              message: 'src/geometry must not import the studio layer (DESIGN.md §4).',
            },
          ],
        },
      ],
    },
  },
)
