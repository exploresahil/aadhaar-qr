import z from "zod";

export const ImageSizeSchema = z.object({
  banner: z.string(),
  card: z.string(),
  avatar: z.string(),
});

export type ImageSizeSchemaType = z.infer<typeof ImageSizeSchema>;

export const ImageSize: ImageSizeSchemaType = {
  banner: "(max-width: 768px) 600px, (max-width: 1200px) 800px, 1920px",
  card: "(max-width: 768px) 500px, (max-width: 1200px) 600px, 700px",
  avatar: "(max-width: 768px) 100px, (max-width: 1200px) 150px, 200px",
};
