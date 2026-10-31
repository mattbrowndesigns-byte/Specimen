"use client";
import AddMenu from "./AddMenu";
import MoreMenu from "./MoreMenu";
import Wordmark from "./Wordmark";
import NotificationBell from "./NotificationBell";
import DemoAdd from "./DemoAdd";
import DemoNotice from "./DemoNotice";
import { useIsDemo } from "./demoState";
import { addItem, jobHandoffUrl, resourceHandoffUrl } from "@/lib/addItem";

// The library's chrome, the same on every page: identity (which doubles as the
// way home), the review bell, Add, and a menu holding everything that isn't a
// constant reach -- including the theme, which is a preference you set once and
// not an action you take, so it lives under Settings in that menu.
//
// The dashboard passes `onAdd` because it can show capture progress inline.
// Everywhere else, a save hands the job to the dashboard through the query
// string and navigates there, so you always end up watching the capture.
export default function UtilityBar({ onAdd, onError }) {
  const demo = useIsDemo();

  async function handleAdd(kind, url) {
    if (onAdd) return onAdd(kind, url);
    const result = await addItem(kind, url);
    if (result.error) {
      onError?.(result.error);
      return false;
    }
    // A resource comes back with a row and no job, since there's no capture to
    // watch -- so it hands over an id instead and the dashboard takes it from
    // there. Reading result.job blindly here threw on the third kind of save.
    window.location.href = result.resource
      ? resourceHandoffUrl(result.resource)
      : jobHandoffUrl(result.job);
    return true;
  }

  return (
    <>
      {/* The one thing on screen that tells a visitor from a LinkedIn link
          where they are. Everything else is the app exactly as its owner sees
          it; this says that changes go nowhere before a refusal has to. */}
      {demo && (
        <div className="demo-banner">
          <p>
            You&rsquo;re exploring a demo of Kivli. Look around; changes aren&rsquo;t saved.
          </p>
          <span className="demo-banner-links">
            <a href="/login">Create Your Own</a>
            <a href="/demo/exit">Exit Demo</a>
          </span>
        </div>
      )}
      {demo && <DemoNotice />}
      <header className="utility-bar">
        <div className="utility-bar-inner">
          <div className="brand">
            <a className="utility-bar-title wordmark-link" href="/">
              <Wordmark />
            </a>
            {/* Outside the link: the wordmark is the target, the tagline is
                description, and a hover that greyed both would read as one word. */}
            <span className="brand-tagline">Your visual inspiration library</span>
          </div>
          <div className="nav-links">
            <NotificationBell />
            {demo ? <DemoAdd /> : <AddMenu onSubmit={handleAdd} />}
            <MoreMenu />
          </div>
        </div>
      </header>
    </>
  );
}
