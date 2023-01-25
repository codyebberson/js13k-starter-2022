import ampClosurePlugin from '@ampproject/rollup-plugin-closure-compiler';
import typescriptPlugin from '@rollup/plugin-typescript';
import advzip from 'advzip-bin';
import { execFileSync } from 'child_process';
import CleanCSS from 'clean-css';
import ect from 'ect-bin';
import fs, { statSync } from 'fs';
import { CompileOptions, compiler as ClosureCompiler } from 'google-closure-compiler';
import htmlMinify from 'html-minifier-terser';
import path from 'path';
import { Input, InputAction, InputType, Packer } from 'roadroller';
import { OutputAsset, OutputChunk, OutputOptions, RenderedChunk } from 'rollup';
import { ECMA } from 'terser';
import { defineConfig, IndexHtmlTransformContext, Plugin, PluginOption } from 'vite';

// Use this setting to control the TypeScript compiler
// ESBuild is built in with Vite, and runs very fast.
// However, it always strips comments, and does some rewriting,
// so you may need to disable it.
// Alternatively, you can use "tsc", the standard TypeScript compiler.
const TYPESCRIPT_COMPILER = process.env['TYPESCRIPT_COMPILER'] || 'esbuild'; // 'esbuild' or 'tsc'

// Use this setting to the control Vite's minify behavior.
// By default, Vite uses ESBuild to minify the JS.
// Vite includes support for Terser, which is slower but better.
// You can also disable minification entirely.
// That may be useful if you want to let Closure Compiler do all minification.
const VITE_MINIFY = process.env['VITE_MINIFY'] || 'terser'; // 'terser', 'esbuild', or false

// Google Closure Compiler implementation.
// 1) "closure" - Calls Google Closure Compiler directly.
// 2) "amp" - Uses the AMP Project wrapper.  This provides slightly better results, but is more picky about syntax errors.
// 3) "none" - Useful for debugging.
const CLOSURE_COMPILER = process.env['CLOSURE_COMPILER'] || 'closure'; // 'closure', 'amp', or 'none'

export default defineConfig(({ command, mode }) => {
  if (command !== 'build') {
    return {
      server: {
        port: 3000,
      },
    };
  }

  console.log('TYPESCRIPT_COMPILER', TYPESCRIPT_COMPILER);
  console.log('VITE_MINIFY', VITE_MINIFY);
  console.log('CLOSURE_COMPILER', CLOSURE_COMPILER);

  const plugins: PluginOption[] = [];

  if (TYPESCRIPT_COMPILER === 'tsc') {
    plugins.push(typescriptPlugin());
  }

  if (CLOSURE_COMPILER !== 'none') {
    const closureOptions = {
      language_in: 'ECMASCRIPT_NEXT',
      language_out: 'ECMASCRIPT_NEXT',
      compilation_level: 'ADVANCED', // WHITESPACE_ONLY, SIMPLE, ADVANCED
      externs: 'externs.js',
      strict_mode_input: true,
      jscomp_off: '*',
      summary_detail_level: '3',
    };

    if (CLOSURE_COMPILER === 'closure') {
      plugins.push(closureCompilerPlugin(closureOptions));
    } else if (CLOSURE_COMPILER === 'amp') {
      plugins.push(ampClosurePlugin(closureOptions));
    }
  }

  plugins.push(roadrollerPlugin());
  plugins.push(ectPlugin());
  plugins.push(advzipPlugin());

  return {
    esbuild: TYPESCRIPT_COMPILER === 'esbuild' ? {} : false,
    build: {
      target: 'esnext',
      minify: VITE_MINIFY as 'esbuild' | 'terser' | false,
      polyfillModulePreload: false, // Don't add vite polyfills
      cssCodeSplit: false,
      brotliSize: false,
      terserOptions: {
        compress: {
          ecma: 2020 as ECMA,
          module: true,
          passes: 3,
          unsafe_arrows: true,
          unsafe_comps: true,
          unsafe_math: true,
          unsafe_methods: true,
          unsafe_proto: true,
        },
        mangle: {
          module: true,
          toplevel: true,
        },
        format: {
          comments: false,
          ecma: 2020 as ECMA,
        },
        module: true,
        toplevel: true,
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          manualChunks: undefined,
        },
      },
    },
    plugins,
  };
});

/**
 * Creates a Google Closure Compiler plugin to minify the JavaScript.
 * @param requestedCompileOptions The options passed to the Google Closure Compiler.
 * @returns The closure compiler plugin.
 */
function closureCompilerPlugin(requestedCompileOptions: CompileOptions = {}): Plugin {
  return {
    name: 'closure-compiler',
    renderChunk: (code: string, chunk: RenderedChunk, options: OutputOptions) => {
      // https://rollupjs.org/guide/en/#renderchunk
      if (!chunk.fileName.endsWith('.js')) {
        // Returning null will apply no transformations.
        return null;
      }
      return new Promise((resolve, reject) => {
        const inputFileName = path.resolve(options.dir as string, 'closure-input.js');
        const outputFileName = path.resolve(options.dir as string, 'closure-output.js');
        fs.writeFileSync(inputFileName, code);

        const closureCompiler = new ClosureCompiler({
          ...requestedCompileOptions,
          js: inputFileName,
          js_output_file: outputFileName,
        });

        closureCompiler.run((exitCode, _stdOut, stdErr) => {
          console.log('Closure Compiler exited with code ' + exitCode);
          console.log(stdErr.trim());
          if (exitCode === 0) {
            resolve({ code: fs.readFileSync(outputFileName, 'utf8') });
          } else {
            reject(stdErr);
          }
        });
      });
    },
  };
}

/**
 * Creates the Roadroller plugin that crunches the JS and CSS.
 * @returns The roadroller plugin.
 */
function roadrollerPlugin(): Plugin {
  return {
    name: 'vite:roadroller',
    transformIndexHtml: {
      enforce: 'post',
      transform: async (html: string, ctx?: IndexHtmlTransformContext): Promise<string> => {
        // Only use this plugin during build
        if (!ctx || !ctx.bundle) {
          return html;
        }

        const options = {
          includeAutoGeneratedTags: true,
          removeAttributeQuotes: true,
          removeComments: true,
          removeRedundantAttributes: true,
          removeScriptTypeAttributes: true,
          removeStyleLinkTypeAttributes: true,
          sortClassName: true,
          useShortDoctype: true,
          collapseWhitespace: true,
          collapseInlineTagWhitespace: true,
          removeEmptyAttributes: true,
          removeOptionalTags: true,
          sortAttributes: true,
        };

        const bundleOutputs = Object.values(ctx.bundle);
        const javascript = bundleOutputs.find((output) => output.fileName.endsWith('.js')) as OutputChunk;
        const css = bundleOutputs.find((output) => output.fileName.endsWith('.css')) as OutputAsset;
        const otherBundleOutputs = bundleOutputs.filter((output) => output !== javascript && output !== css);
        if (otherBundleOutputs.length > 0) {
          otherBundleOutputs.forEach((output) => console.warn(`WARN Asset not inlined: ${output.fileName}`));
        }

        const cssInHtml = css ? embedCss(html, css) : html;
        const minifiedHtml = await htmlMinify.minify(cssInHtml, options);
        return embedJs(minifiedHtml, javascript);
      },
    },
  };
}

/**
 * Transforms the given JavaScript code into a packed version.
 * @param html The original HTML.
 * @param chunk The JavaScript output chunk from Rollup/Vite.
 * @returns The transformed HTML with the JavaScript embedded.
 */
async function embedJs(html: string, chunk: OutputChunk): Promise<string> {
  const scriptTagRemoved = html.replace(new RegExp(`<script[^>]*?src=[\./]*${chunk.fileName}[^>]*?></script>`), '');
  const htmlInJs = `document.write('${scriptTagRemoved}');` + chunk.code.trim();

  const inputs: Input[] = [
    {
      data: htmlInJs,
      type: 'js' as InputType,
      action: 'eval' as InputAction,
    },
  ];
  const options = {};
  const packer = new Packer(inputs, options);
  await packer.optimize(2);
  const { firstLine, secondLine } = packer.makeDecoder();
  return `<script>\n${firstLine}\n${secondLine}\n</script>`;
}

/**
 * Embeds CSS into the HTML.
 * @param html The original HTML.
 * @param asset The CSS asset.
 * @returns The transformed HTML with the CSS embedded.
 */
function embedCss(html: string, asset: OutputAsset): string {
  const reCSS = new RegExp(`<link rel="stylesheet"[^>]*?href="[\./]*${asset.fileName}"[^>]*?>`);
  const code = `<style>${new CleanCSS({ level: 2 }).minify(asset.source as string).styles}</style>`;
  return html.replace(reCSS, code);
}

/**
 * Creates the ECT plugin that uses Efficient-Compression-Tool to build a zip file.
 * @returns The ECT plugin.
 */
function ectPlugin(): Plugin {
  return {
    name: 'vite:ect',
    writeBundle: async (): Promise<void> => {
      try {
        const args = ['-strip', '-zip', '-10009', 'dist/index.html', 'dist/i.png'];
        const result = execFileSync(ect, args);
        console.log('ECT result', result.toString().trim());
        const stats = statSync('dist/index.zip');
        console.log('ECT ZIP size', stats.size);
      } catch (err) {
        console.log('ECT error', err);
      }
    },
  };
}

/**
 * Creates the advzip plugin that uses AdvanceCOMP to optimize the zip file.
 * @returns The advzip plugin.
 */
function advzipPlugin(): Plugin {
  return {
    name: 'vite:advzip',
    writeBundle: async (): Promise<void> => {
      try {
        const args = ['--recompress', '--shrink-extra', 'dist/index.zip'];
        const result = execFileSync(advzip, args);
        console.log(result.toString().trim());
        const stats = statSync('dist/index.zip');
        console.log('advzip ZIP size', stats.size);
      } catch (err) {
        console.log('advzip error', err);
      }
    },
  };
}
