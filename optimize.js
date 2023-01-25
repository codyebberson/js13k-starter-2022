const { execSync } = require('child_process');
const { statSync, copyFileSync } = require('fs');

const stats = {};
let bestSize = Infinity;

function main() {
  for (let i = 0; i < 10; i++) {
    runOneIteration();
  }

  for (const entry in Object.entries(stats).sort((a, b) => a[1] - b[1])) {
    console.log(entry, stats[entry]);
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

  const key = `${typescript}-${minify}-${closure}`;
  if (key in stats) {
    stats[key] = Math.min(stats[key], stats.size);
  } else {
    stats[key] = stats.size;
  }

  if (stats.size < bestSize) {
    bestSize = stats.size;
    copyFileSync('dist/index.zip', 'index.best.zip');
  }
}

if (require.main === module) {
  main();
}
