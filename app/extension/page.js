"use client";
import { useState } from "react";
import { BadgeCheck, Crop, Download, FolderPlus, Images, Keyboard, PanelTop } from "lucide-react";
import UtilityBar from "../_ui/UtilityBar";
import SiteFooter from "../_ui/SiteFooter";
import { useIsDemo } from "../_ui/demoState";

// What the browser extension does and how to put it in Chrome. Laid out like
// /connect, because it is the same kind of page: a thing set up once, by
// someone who may never have loaded an extension by hand.
//
// The demo has no library to save into, so it gets the first half only.

const ABILITIES = [
  {
    Icon: PanelTop,
    title: "Save without leaving the page",
    body: "Press the button on any page and save it as a website or a resource. The screenshots and tags happen in the background, and you can close the panel as soon as you press Save.",
  },
  {
    Icon: FolderPlus,
    title: "File it as you save",
    body: "Add it to a collection, or make a new one. Put a resource in a folder yourself or let AI choose, and leave a note saying why it was worth keeping.",
  },
  {
    Icon: Images,
    title: "Pick images off any page",
    body: "Choose Visual and tick the images you want from the ones on your screen. That gets past most sites that turn Kivli away. A clip finishes in Kivli’s own picker.",
  },
  {
    Icon: Crop,
    title: "Grab what you can see",
    body: "Choose Component to photograph the screen as it is, signed in or mid-menu, and crop it straight away. Full-page capture is still there.",
  },
  {
    Icon: BadgeCheck,
    title: "Know when you already have it",
    body: "The panel says when the page is already in your library and links to it, so you don’t save it twice.",
  },
  {
    Icon: Keyboard,
    title: "One shortcut",
    body: "Option Shift K on a Mac, Alt Shift K elsewhere. Return saves, so a website is two keystrokes from your library.",
  },
];

const FOLDER = "extension";

export default function ExtensionPage() {
  const demo = useIsDemo();
  const [error, setError] = useState(null);

  return (
    <>
      <UtilityBar onError={setError} />

      <main className="page page-wide">
        <div className="top-nav">
          <h1>Browser Extension</h1>
        </div>

        <p className="connect-lede">
          A Kivli button for Chrome, so the page you&rsquo;re looking at is one press from your library.
        </p>

        {error && <p className="error">{error}</p>}

        <h2 className="connect-heading">What it does</h2>
        <div className="connect-cards connect-cards-pairs">
          {ABILITIES.map(({ Icon, title, body }) => (
            <article className="connect-card" key={title}>
              <span className="connect-card-icon">
                <Icon size={18} aria-hidden="true" />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>

        {!demo && (
          <>
            <h2 className="connect-heading">Set it up in three steps</h2>
            <ol className="connect-setup">
              <li className="connect-step">
                <span className="connect-step-number" aria-hidden="true">1</span>
                <div className="connect-step-body">
                  <h3>Download it</h3>
                  <a className="extension-download" href="/kivli-extension.zip" download>
                    <Download size={15} aria-hidden="true" />
                    Download the Extension
                  </a>
                  <p className="connect-note">
                    Double-click the download to unzip it, then move the folder called{" "}
                    <strong>{FOLDER}</strong> somewhere it can stay. Chrome runs it from there, so deleting
                    the folder removes the button.
                  </p>
                </div>
              </li>

              <li className="connect-step">
                <span className="connect-step-number" aria-hidden="true">2</span>
                <div className="connect-step-body">
                  <h3>Add it to Chrome</h3>
                  <ol className="connect-steps">
                    <li>
                      Type <strong>chrome://extensions</strong> into the address bar and press Return.
                    </li>
                    <li>Turn on Developer mode, at the top right.</li>
                    <li>
                      Press Load unpacked and choose the <strong>{FOLDER}</strong> folder.
                    </li>
                  </ol>
                  <p className="connect-note">Arc, Edge and Brave run Chrome&rsquo;s extensions too.</p>
                </div>
              </li>

              <li className="connect-step">
                <span className="connect-step-number" aria-hidden="true">3</span>
                <div className="connect-step-body">
                  <h3>Pin it, then save something</h3>
                  <p className="connect-step-text">
                    Press the puzzle piece beside the address bar, then the pin next to Kivli. Open any page
                    and press the button, or Option Shift K on a Mac. It uses the Kivli sign-in this browser
                    already has.
                  </p>
                </div>
              </li>
            </ol>

            <section className="connect-explain">
              <h2>What it can see</h2>
              <p>
                Only the page you press the button on, and only then. Its address goes to Kivli when the panel
                opens, to check whether you already have it. It looks through the page for images when you
                choose Visual and sends the ones you tick, and it photographs the screen when you press Grab
                This Screen. It can&rsquo;t see other tabs or your history.
              </p>
            </section>
          </>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
