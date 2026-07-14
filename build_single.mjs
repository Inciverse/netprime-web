import fs from 'fs';
import path from 'path';
import { transformSync } from 'esbuild';

const root = 'C:\\Users\\WORK PC\\Desktop\\NetPrimeWeb';
const srcHtml = fs.readFileSync(path.join(root, 'source.html'), 'utf8');

const reactPath = path.join(root, 'web', 'node_modules', 'react', 'umd', 'react.production.min.js');
const reactDomPath = path.join(root, 'web', 'node_modules', 'react-dom', 'umd', 'react-dom.production.min.js');
const react = fs.readFileSync(reactPath, 'utf8');
const reactDom = fs.readFileSync(reactDomPath, 'utf8');
const reactB64 = Buffer.from(react, 'utf8').toString('base64');
const reactDomB64 = Buffer.from(reactDom, 'utf8').toString('base64');

const m = srcHtml.match(/<script type='text\/babel'[^>]*>([\s\S]*?)<\/script>/);
if (!m) { console.error('app script not found'); process.exit(1); }
const appCode = m[1];
const out = transformSync(appCode, {
  loader: 'jsx',
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  format: 'iife'
}).code;
const appB64 = Buffer.from(out, 'utf8').toString('base64');

let html = srcHtml;
html = html.replace(/<script crossorigin src='https:\/\/unpkg.com\/react@18\/umd\/react.production.min.js'><\/script>\s*/, '');
html = html.replace(/<script crossorigin src='https:\/\/unpkg.com\/react-dom@18\/umd\/react-dom.production.min.js'><\/script>\s*/, '');
html = html.replace(/<script src='https:\/\/unpkg.com\/@babel\/standalone@7\/babel.min.js'><\/script>\s*/, '');
html = html.replace(/<script type='text\/babel'[^>]*>[\s\S]*?<\/script>/,
  `<script>eval(atob("${reactB64}"))</script>\n    <script>eval(atob("${reactDomB64}"))</script>\n    <script>eval(atob("${appB64}"))</script>`);

const inlineConfig = {
  streamUrl: process.env.STREAM_URL || "",
  streamUrlFallback: process.env.STREAM_URL_FALLBACK || "",
};
html = html.replace("</head>", `<script>window.__NETPRIME_CONFIG__ = ${JSON.stringify(inlineConfig)};</script>\n</head>`);

fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('built index.html, length=' + html.length);
