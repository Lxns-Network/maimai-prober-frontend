declare global {
  namespace Vike {
    interface PageContext {
      redirect?: string;
      songId?: number;
      loginState?: {
        expired?: boolean;
        reset?: boolean;
      };
    }
  }
}

export { };
