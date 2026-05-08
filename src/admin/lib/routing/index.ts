/**
 * Tiny in-house router for the admin app. Replaces react-router-dom for the
 * 4-route admin shell. Admin-only — banned in src/core/, src/modules/, and
 * src/admin/pages/site/ (gated by the site-page no-router architecture test).
 *
 * The .tsx/.ts split between Router.tsx and routerHooks.ts is required for
 * React Fast Refresh: mixing component and non-component exports breaks HMR.
 */
export {
  Router,
  MemoryRouter,
  Routes,
  Route,
  Navigate,
  Link,
} from './Router'
export {
  useLocation,
  useNavigate,
  useParams,
  useInRouterContext,
} from './routerHooks'
