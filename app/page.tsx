import { DemoHome } from "@/components/marketing/demo-home";
import { ProductLanding } from "@/components/marketing/product-landing";

/**
 * The public front door. The server edition is the product itself, so it opens
 * on the product's own landing page. The online demo (GitHub Pages) keeps the
 * walk-through home page for the team.
 */
export default function Home() {
  return process.env.NEXT_PUBLIC_STATIC_DEMO === "1" ? <DemoHome /> : <ProductLanding />;
}
