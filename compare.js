const { execSync } = require('child_process');
const { statSync, appendFileSync } = require('fs');

function main() {
  for (let i = 0; i < 10; i++) {
    runOneIteration();
  }
}

function runOneIteration() {
  for (const typescript of ['esbuild', 'tsc']) {
    for (const minify of ['terser', 'esbuild', 'false']) {
      for (const closure of ['closure', 'amp', 'none']) {
        runOneBuild(typescript, minify, closure);
      }
    }
  }
}

function runOneBuild(typescript, minify, closure) {
  const result = execSync('npm run build', {
    env: {
      TYPESCRIPT_COMPILER: typescript,
      VITE_MINIFY: minify,
      CLOSURE_COMPILER: closure,
    },
  });
  console.log(result.toString());

  const stats = statSync('dist/index.zip');
  console.log('ZIP size', stats.size);
  appendFileSync('stats.csv', `${typescript},${minify},${closure},${stats.size}\n`);
}

if (require.main === module) {
  main();
}
