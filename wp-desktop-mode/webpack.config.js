/**
 * Webpack configuration for the WP Desktop Mode plugin.
 *
 * Compiles TypeScript source files from src/*.ts into assets/js/.
 *
 * @since 0.1.0
 */

const TerserPlugin = require( 'terser-webpack-plugin' );
const { join } = require( 'path' );

module.exports = function ( env = { environment: 'production', watch: false } ) {
	const mode = env.environment || 'production';

	return {
		target: 'browserslist',
		mode,
		cache: true,
		entry: {
			'desktop':     './src/desktop.ts',
			'desktop.min': './src/desktop.ts',
		},
		output: {
			path: join( __dirname, 'assets/js' ),
			filename: '[name].js',
		},
		resolve: {
			extensions: [ '.ts', '.js' ],
		},
		module: {
			rules: [
				{
					test: /\.ts$/,
					use: [
						{
							loader: 'ts-loader',
							options: {
								configFile: join( __dirname, 'tsconfig.json' ),
								transpileOnly: true,
							},
						},
					],
					exclude: /node_modules/,
				},
			],
		},
		optimization: {
			minimize: true,
			moduleIds: 'deterministic',
			minimizer: [
				new TerserPlugin( {
					include: /\.min\.js$/,
					extractComments: false,
				} ),
			],
		},
		watch: env.watch,
	};
};
