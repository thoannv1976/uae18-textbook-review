/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: [
      'pdf-parse',
      'mammoth',
      'pdfkit',
      'docx',
      'firebase-admin',
    ],
  },
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
