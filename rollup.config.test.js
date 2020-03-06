import typescript from 'rollup-plugin-typescript2'
import resolve from 'rollup-plugin-node-resolve'

export default {
    input: './src/test/web.ts',
    output: {
        file: './test/web.js',
        format: 'iife',
        name: 'test',
        sourcemap: true,
    },
    plugins: [
        typescript({
            tsconfig: './tsconfig.test.web.json'
        }),
        resolve({
            sourcemap: true
        })
    ]
}