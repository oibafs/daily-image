export interface Image {
  subject: string;
  formats: ("q4k" | "mac" | "iphone13Pro" | "galaxyA51" | "galaxyJ7Pro" | "galaxyS9P")[];
}

export default interface Images {
  images: Image[];
}