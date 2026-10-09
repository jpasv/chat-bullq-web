import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTypeScript,
  { ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts'] },
];

export default config;
