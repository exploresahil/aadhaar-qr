declare module "jpeg2000" {
  export class JpxImage {
    failOnCorruptedImage: boolean;
    width: number;
    height: number;
    componentsCount: number;
    tiles: Array<{ items: Uint8Array }>;
    parse(data: Uint8Array): void;
    parseImageProperties(data: Uint8Array): void;
    parseCodestream(data: Uint8Array, start: number, end: number): void;
  }
}
