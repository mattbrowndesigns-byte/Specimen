"use client";
import AddMenu from "./AddMenu";
import MoreMenu from "./MoreMenu";
import { X } from "lucide-react";
import Wordmark from "./Wordmark";
import NotificationBell from "./NotificationBell";
import DemoAdd from "./DemoAdd";
import DemoNotice from "./DemoNotice";
import { closeDemoBanner, useDemoBannerClosed, useIsDemo } from "./demoState";
import { addItem, jobHandoffUrl, resourceHandoffUrl } from "@/lib/addItem";
import { UPLOAD_PROBLEMS_KEY, describeUpload, sortFiles, uploadVisualFiles } from "@/lib/visualUploadClient";

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
  const bannerClosed = useDemoBannerClosed();

  async function handleAdd(kind, url) {
    if (onAdd) return onAdd(kind, url);
    const result = await addItem(kind, url);
    if (result.error) {
      onError?.(result.error);
      return false;
    }
    if (result.redirect) {
      window.location.href = result.redirect;
      return true;
    }
    // A resource comes back with a row and no job, since there's no capture to
    // watch -- so it hands over an id instead and the dashboard takes it from
    // there. Reading result.job blindly here threw on the third kind of save.
    window.location.href = result.resource
      ? resourceHandoffUrl(result.resource)
      : jobHandoffUrl(result.job);
    return true;
  }

  // Uploaded images go to the Visuals tab, where they land on the board. The
  // describe is sent with keepalive so it survives the navigation; if it
  // doesn't answer, the batch is already in the queue and fills in there.
  async function handleUpload(files, onProgress) {
    const { ok, skipped } = sortFiles(files);
    if (!ok.length) {
      onError?.(skipped[0] || "Choose a PNG, JPEG, WebP or GIF.");
      return false;
    }
    try {
      const result = await uploadVisualFiles(ok, {
        onProgress: ({ done, total }) => onProgress(`Uploading ${Math.min(done + 1, total)} of ${total}…`),
      });
      if (!result.visuals.length) {
        onError?.(result.failed[0] || "Those images couldn't be uploaded.");
        return false;
      }
      describeUpload(result.projectId, { keepalive: true });
      const problems = [...skipped, ...result.failed];
      // Said on the board they're about to land on: an error shown here would
      // be gone with the page before anyone read it.
      if (problems.length) {
        try {
          sessionStorage.setItem(UPLOAD_PROBLEMS_KEY, JSON.stringify(problems));
        } catch {
          // Not shown is the cost of no storage; the files that worked are saved.
        }
      }
      window.location.href = "/?tab=visuals";
      return true;
    } catch (err) {
      onError?.(err.message);
      return false;
    }
  }

  return (
    <>
      {/* The one thing on screen that tells a visitor from a LinkedIn link
          where they are. Everything else is the app exactly as its owner sees
          it; this says that changes go nowhere before a refusal has to. */}
      {demo && !bannerClosed && (
        <div className="demo-banner">
          <p>
            You&rsquo;re exploring a demo of Kivli. Look around; changes aren&rsquo;t saved.
          </p>
          <button
            type="button"
            className="demo-banner-close"
            onClick={closeDemoBanner}
            aria-label="Close this message"
          >
            <X size={16} />
          </button>
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
            {demo ? <DemoAdd /> : <AddMenu onSubmit={handleAdd} onUpload={handleUpload} />}
            <MoreMenu />
          </div>
        </div>
      </header>
    </>
  );
}
