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
              group: ['@/geometry', '@/geometry/*', '@/studio', '@/studio/*', '@/io', '@/io/*', '@/author', '@/author/*'],
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
              group: ['@/studio', '@/studio/*', '@/author', '@/author/*'],
              message: 'src/geometry must not import outer layers (DESIGN.md §4).',
            },
          ],
        },
      ],
    },
  },

  // src/io is pure data: parsing and formats only, no rendering, math only.
  {
    files: ['src/io/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['three', 'three/*', 'three-gpu-pathtracer', 'three-gpu-pathtracer/*'],
              message: 'src/io is pure data: no rendering dependencies (DESIGN.md §4).',
            },
            {
              group: ['@/geometry', '@/geometry/*', '@/studio', '@/studio/*', '@/author', '@/author/*'],
              message: 'src/io may import only src/math (DESIGN.md §4).',
            },
          ],
        },
      ],
    },
  },

  // src/studio is generic rendering runtime: it must not know about curves.
  {
    files: ['src/studio/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/author', '@/author/*'],
              message: 'src/studio must not import the author layer (DESIGN.md §4).',
            },
          ],
        },
      ],
    },
  },
)
