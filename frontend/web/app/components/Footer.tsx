export function Footer() {
  return (
    <footer className="app-footer">
      <div className="wrap app-wrap app-footer-inner">
        <span>GitBounty — built for CodeSlayer 2K26.</span>
        <span>&copy; {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
