// SPDX-License-Identifier: Apache-2.0
export const version: '0.2.0';
export const wireVersion: 2;
export const maxTextBytes: 1200;
export const maxImagePixels: 4194304;
export type CorrectionLevel = 'L' | 'M' | 'Q' | 'H';
export interface EncodeOptions { ecc?: CorrectionLevel; }
export interface RGBAImage { width: number; height: number; data: Uint8Array | Uint8ClampedArray; }
export interface Symbol { readonly id: number; readonly candidate: number; readonly name: string; readonly ink: string; readonly rgb: readonly number[]; readonly shape: 'solid' | 'horizontal' | 'vertical' | 'slash' | 'backslash'; }
export const alphabet: readonly Symbol[];
/** Treat the code as an opaque encoder result; use toMatrix() to serialize symbols. */
export interface Code { readonly mode: 'p19'; readonly version: 2; readonly n: number; readonly width: number; readonly height: number; readonly ecc: CorrectionLevel; readonly bytes: number; readonly bodyBytes: number; readonly encrypted: boolean; readonly k: number; readonly blocks: number; readonly repairCount: number; readonly paritySymbols: number; readonly digitCount: number; readonly cells: Int16Array; }
export interface Session { clear(): void; }
export interface GridCandidate { dimension: number; map(x: number, y: number): { x: number; y: number }; }
export type Locator = (data: Uint8Array | Uint8ClampedArray, width: number, height: number) => GridCandidate[];
export interface ScanOptions {
  soft?: boolean; equations?: boolean; spatial?: boolean; refine?: boolean;
  session?: Session; locate?: Locator;
  /** Reuse a recent grid pose with a session; every payload is decoded again. Default true. */
  tracking?: boolean;
  /** Include per-stage timing and search counters. Default false. */
  diagnostics?: boolean;
  /** Cooperative total search budget in milliseconds, 10–10000. Default 2200. */
  maxTimeMs?: number;
  /** Nonnegative safe integer identifying one camera capture. Duplicate retained IDs are not fused. */
  frameId?: number;
}
export interface ScanDiagnostics {
  locateCalls: number; candidates: number; observations: number; tracked: boolean;
  locateMs: number; observeMs: number; classifyMs: number; decodeMs: number;
}
export interface ScanMetadata { diagnostics?: ScanDiagnostics; }
export interface DecodedResult extends ScanMetadata { kind: 'prism19'; mode: 'p19'; text: string; bytes: number; envelope: number[]; encrypted: false; verified: true; checksum: string; ms: number; decoder: string; corrected: number; repaired: number; equations: number; frames: number; grid: number; }
export interface EncryptedResult extends ScanMetadata { kind: 'encrypted'; mode: 'p19'; bytes: number; envelope: number[]; encrypted: true; verified: true; checksum: string; ms: number; decoder: string; corrected: number; repaired: number; equations: number; frames: number; grid: number; }
export interface PartialResult extends ScanMetadata { kind: 'partial19'; timedOut?: true; mode: 'p19'; frames: number; grid: number; ms: number; needed?: string; }
export interface NoResult extends ScanMetadata { kind: 'none'; timedOut?: true; mode: 'p19'; ms: number; }
export type ScanResult = DecodedResult | EncryptedResult | PartialResult | NoResult;
export type SymbolMatrix = (number | null)[][];
export function encode(text: string, options?: EncodeOptions): Code;
/** Envelope must be the 45–1244 byte AES-GCM envelope defined in the format. */
export function encodeEnvelope(data: Uint8Array, options?: EncodeOptions): Code;
export function encodeEncrypted(text: string, passphrase: string, options?: EncodeOptions): Promise<Code>;
export function encrypt(text: string, passphrase: string): Promise<Uint8Array>;
export function decrypt(data: Uint8Array, passphrase: string): Promise<string>;
export function toSVG(code: Code, pixelsPerModule?: number): string;
export function toRGBA(code: Code, pixelsPerModule?: number): RGBAImage;
/** No quiet zone. -2 = fixed white; -1 = fixed black; 0–18 = data glyph. */
export function toMatrix(code: Code): number[][];
/** null means an unknown observation. No optical detection is performed. */
export function decodeMatrix(matrix: SymbolMatrix, options?: Pick<ScanOptions, 'soft' | 'equations'>): ScanResult;
export function scan(image: RGBAImage, options?: ScanOptions): ScanResult;
export function createSession(): Session;
declare const api: { version: typeof version; wireVersion: typeof wireVersion; maxTextBytes: typeof maxTextBytes; maxImagePixels: typeof maxImagePixels; alphabet: typeof alphabet; encode: typeof encode; encodeEnvelope: typeof encodeEnvelope; encodeEncrypted: typeof encodeEncrypted; encrypt: typeof encrypt; decrypt: typeof decrypt; toSVG: typeof toSVG; toRGBA: typeof toRGBA; toMatrix: typeof toMatrix; decodeMatrix: typeof decodeMatrix; scan: typeof scan; createSession: typeof createSession; };
export default api;
