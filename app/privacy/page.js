// What Kivli and its browser extension do with what they're given. Linked from
// the Chrome Web Store, which requires it and checks it against what the
// extension declares -- so a change to what either sends, stores or hands on is
// a change here, and to the store's Privacy tab, in the same breath.
export default function PrivacyPage() {
  return (
    <main className="page prose-page">
      <header className="prose-head">
        <h1>Privacy</h1>
        <p className="prose-lede">
          What Kivli and the Kivli browser extension collect, where it goes, and what you can do about it.
          Last updated 23 November 2026.
        </p>
      </header>

      <section className="prose-row">
        <div className="prose-section prose-row-aside">
          <h2>The short version</h2>
        </div>
        <div className="prose-section">
          <p>
            Kivli keeps what you save so you can find it again. It isn&rsquo;t sold, it isn&rsquo;t used for
            advertising, and nobody else sees your library unless you share it.
          </p>
        </div>
      </section>

      <section className="prose-row">
        <div className="prose-section prose-row-aside">
          <h2>The browser extension</h2>
        </div>
        <div className="prose-section">
          <p>
            The extension does nothing until you press its button, and then it only looks at the page you
            pressed it on. It can&rsquo;t see your other tabs or your browsing history.
          </p>
          <h3>When you open it</h3>
          <p>
            The page&rsquo;s address is sent to Kivli to check whether you&rsquo;ve already saved it. That
            check isn&rsquo;t kept.
          </p>
          <h3>When you save</h3>
          <p>
            The page&rsquo;s address and title are sent, with any note, folder or collection you chose, and
            stored in your library.
          </p>
          <h3>When you choose Visual</h3>
          <p>
            The extension looks through the page for images and clips and lists them for you. Only the ones
            you tick are sent: their addresses, any description the page gives them, and the page&rsquo;s
            title and the maker&rsquo;s name. Kivli then downloads those files into your library.
          </p>
          <h3>When you press Grab This Screen</h3>
          <p>
            A picture of the visible part of the page is sent and stored, so anything on screen is in it.
            Nothing is photographed at any other time.
          </p>
          <h3>Signing in</h3>
          <p>
            The extension uses the Kivli sign-in your browser already has. It doesn&rsquo;t ask for, read or
            store your password. On your computer it keeps which kind of save you used last and, until Chrome
            closes, why a save failed.
          </p>
        </div>
      </section>

      <section className="prose-row">
        <div className="prose-section prose-row-aside">
          <h2>What Kivli stores</h2>
        </div>
        <div className="prose-section">
          <p>
            Your email address, the name you give, and a password Kivli itself can&rsquo;t read. Everything
            you save: addresses, screenshots, images and clips, summaries, tags, notes and collections.
          </p>
          <p>
            Saved pictures and clips are stored at long, unguessable addresses. Kivli doesn&rsquo;t publish
            them, but anyone you give one of those addresses to can open it.
          </p>
        </div>
      </section>

      <section className="prose-row">
        <div className="prose-section prose-row-aside">
          <h2>Who else handles it</h2>
        </div>
        <div className="prose-section">
          <p>Kivli runs on other companies&rsquo; services, and each gets only what its job needs.</p>
          <h3>Supabase</h3>
          <p>Holds accounts, libraries and files.</p>
          <h3>Vercel</h3>
          <p>Runs the website and counts page views without cookies.</p>
          <h3>Google Gemini</h3>
          <p>
            Writes summaries and tags. It is sent the page&rsquo;s address and text, or the saved pictures.
            Kivli uses its free plan, whose terms let Google use what it&rsquo;s sent to improve its own
            products, and people may review it. Don&rsquo;t save or grab anything confidential.
          </p>
          <h3>GitHub</h3>
          <p>Runs the browser that photographs the websites you save, and is given their addresses.</p>
          <h3>Google&rsquo;s icon service</h3>
          <p>Supplies site icons, so it is told which sites an icon is needed for.</p>
          <h3>Microsoft Clarity</h3>
          <p>Records visits to the public demo, to see where it confuses people. It never runs in an account.</p>
        </div>
      </section>

      <section className="prose-row">
        <div className="prose-section prose-row-aside">
          <h2>Limited use</h2>
        </div>
        <div className="prose-section">
          <p>
            Kivli&rsquo;s use of information received from the extension follows the Chrome Web Store User
            Data Policy, including the Limited Use requirements. It is used only to save, describe and find
            what you choose to save. It is not sold, not used for advertising, and not used to judge
            creditworthiness. Nobody reads it except with your permission, for security, or where the law
            requires it. What Google&rsquo;s plan allows is described above.
          </p>
        </div>
      </section>

      <section className="prose-row">
        <div className="prose-section prose-row-aside">
          <h2>Your choices</h2>
        </div>
        <div className="prose-section">
          <p>
            Delete any save in Kivli and it goes from your library with its files, unless another save uses
            the same file. Turn a share link off and it stops working. Remove the extension from Chrome and it
            can send nothing more.
          </p>
          <p>
            To get a copy of your account&rsquo;s data, or have the account deleted, write to the contact
            address on the extension&rsquo;s Chrome Web Store page.
          </p>
        </div>
      </section>
    </main>
  );
}
