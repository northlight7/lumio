import type { NextConfig } from 'next'
const responsiveQa = process.env.NODE_ENV === 'development' && process.env.LUMIO_RESPONSIVE_QA === 'true'
const config: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  distDir: process.env.NODE_ENV === 'development' && /^isolated-gauntlet(?:-[23])?$/.test(process.env.LUMIO_QA_BUILD_DIR || '') ? `.internal/qa-next${(process.env.LUMIO_QA_BUILD_DIR || '').replace('isolated-gauntlet', '')}` : '.next',
  output: 'standalone', poweredByHeader: false, agentRules: false, devIndicators: false,
  outputFileTracingIncludes: { '/api/*': ['./scripts/parse-attachment.cjs','./node_modules/yauzl/**/*','./node_modules/pend/**/*','./node_modules/saxes/**/*','./node_modules/xmlchars/**/*','./node_modules/csv-parse/**/*'] },
  experimental: { serverActions: { bodySizeLimit: '64kb' } },
  async headers() { return [{ source: '/:path*', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: responsiveQa ? 'SAMEORIGIN' : 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors ${responsiveQa ? "'self'" : "'none'"}; base-uri 'self'; form-action 'self'` }
  ] }] }
}
export default config
