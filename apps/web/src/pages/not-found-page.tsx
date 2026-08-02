import { Link } from "../router";

export function NotFoundPage() {
  return (
    <div className="page">
      <section className="state-panel state-panel--error">
        <span className="eyebrow">Typed route state</span>
        <h1>Record not found</h1>
        <p>
          The requested local record identifier or route is invalid. No fallback query was
          performed.
        </p>
        <Link to="/gallery" className="button button--primary">
          Return to Gallery
        </Link>
      </section>
    </div>
  );
}
