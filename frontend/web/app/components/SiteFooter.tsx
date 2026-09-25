import Image from "next/image";
import logoMark from "../../public/assets/logo_mark.svg";

/* A server component, so the year is rendered once on the server rather than filled in by script after load. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-inner">
        <div className="footer-brand">
          <a className="brand" href="#top" aria-label="GitBounty home">
            <Image src={logoMark} alt="" className="brand-mark" width={28} height={25} priority />
            <span className="brand-name">GitBounty</span>
          </a>
          <p>Open-source work, paid on merge.</p>

          <div className="footer-col">
            <h4>Company</h4>
            <a href="#">About</a>
            <a href="#">Docs</a>
            <a href="#">GitHub</a>
          </div>

          <div className="footer-col">
            <h4>Also available</h4>
            <p className="footer-note">
              Prefer working inline? The GitBounty browser extension overlays bounty badges directly on GitHub&apos;s
              issue list.
            </p>
            <a href="#">Get the extension →</a>
          </div>
        </div>
      </div>

      <div className="wrap footer-bottom">
        <span>&copy; {new Date().getFullYear()} GitBounty. All rights reserved.</span>
        <span className="footer-legal"><a href="#">Terms</a><a href="#">Privacy</a></span>
      </div>
    </footer>
  );
}
