import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <article>
      <header className="page-head">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p className="lead">This page does not exist.</p>
      </header>
      <p className="actions">
        <Link className="button" to="/">Back to Home</Link>
      </p>
    </article>
  );
}
