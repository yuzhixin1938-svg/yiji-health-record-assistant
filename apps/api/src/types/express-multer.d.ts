declare namespace Express {
  namespace Multer {
    type File = {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      destination: string;
      filename: string;
      path: string;
    };
  }
}

declare module "multer" {
  export function diskStorage(options: {
    destination: string | ((request: unknown, file: Express.Multer.File, callback: (error: Error | null, destination: string) => void) => void);
    filename?: (request: unknown, file: Express.Multer.File, callback: (error: Error | null, filename: string) => void) => void;
  }): unknown;
}
