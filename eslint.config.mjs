import nextConfig from 'eslint-config-next/core-web-vitals';

export default [
  ...nextConfig,
  {
    ignores: [
      'src/data/cong/utility/**',
    ],
  },
  {
    rules: {
      // Disable — triggers on valid patterns like useHydrated, useTheme, and
      // effect-based route-change cleanup (Nav.tsx). These all sync React state
      // with external systems (DOM, localStorage, router) which is the intended
      // use case for effects.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];
