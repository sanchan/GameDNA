import { Link } from 'react-router';

export default function Legal() {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link to="/" className="text-sm text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors mb-4 inline-flex items-center gap-1">
            <i className="fa-solid fa-arrow-left" /> Back
          </Link>
          <h1 className="text-3xl lg:text-4xl font-bold mb-2">Legal</h1>
          <p className="text-[var(--text-muted)]">Privacy, terms, and third-party attributions</p>
        </div>

        {/* Steam Disclaimer */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <i className="fa-brands fa-steam text-[var(--text-muted)]" />
            Steam & Valve Attribution
          </h2>
          <div className="space-y-3 text-sm text-[var(--text-body)] leading-relaxed">
            <p>
              GameDNA is <strong>not affiliated with, endorsed by, or sponsored by Valve Corporation</strong> or Steam.
            </p>
            <p>
              Steam, the Steam logo, and all related marks are trademarks and/or registered trademarks
              of Valve Corporation in the United States and/or other countries. All game images,
              descriptions, and metadata displayed in this application are sourced from the{' '}
              <a
                href="https://steamcommunity.com/dev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--primary)] hover:underline"
              >
                Steam Web API
              </a>{' '}
              and remain the property of their respective owners.
            </p>
            <p>
              This application uses the Steam Web API in accordance with the{' '}
              <a
                href="https://steamcommunity.com/dev/apiterms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--primary)] hover:underline"
              >
                Steam Web API Terms of Use
              </a>.
            </p>
          </div>
        </div>

        {/* Privacy Policy */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <i className="fa-solid fa-shield-halved text-[var(--text-muted)]" />
            Privacy Policy
          </h2>
          <div className="space-y-4 text-sm text-[var(--text-body)] leading-relaxed">
            <section>
              <h3 className="font-semibold text-[var(--foreground)] mb-1">What data we collect</h3>
              <p>
                When you sign in with Steam, we access your <strong>public Steam profile</strong> (display name, avatar, Steam ID),
                your <strong>owned games list</strong>, and your <strong>wishlist</strong> — only as authorized by your Steam privacy settings.
                We do not access your password, email, payment information, or private messages.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-[var(--foreground)] mb-1">Where data is stored</h3>
              <p>
                All your personal data — swipe history, taste profile, preferences, and cached game metadata — is stored
                <strong> locally in your local machine</strong> using an in-browser SQLite database (OPFS).
                No personal data is sent to or stored on our servers. Your Steam API key, if provided, is sent
                only to our proxy server to authenticate requests to the Steam Web API and is never logged or persisted.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-[var(--foreground)] mb-1">How we use your data</h3>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>To display your Steam library and wishlist within the app</li>
                <li>To build a local taste profile based on your swipe decisions</li>
                <li>To generate personalized game recommendations (processed locally or via your configured AI provider)</li>
                <li>To provide backlog analysis and gaming statistics</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-[var(--foreground)] mb-1">Third-party services</h3>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Steam Web API</strong> — to fetch game metadata, your library, and wishlist data</li>
                <li><strong>Ollama / WebLLM</strong> (optional) — AI features run locally on your machine or in your local machine; no data is sent to external AI services</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-[var(--foreground)] mb-1">Data export & deletion</h3>
              <p>
                You can export all your data at any time from <Link to="/settings" className="text-[var(--primary)] hover:underline">Settings</Link> (Export Database or Export JSON).
                You can also delete all data using "Clear All Data" in Settings. Since data is stored locally,
                clearing your local machine data will also remove all GameDNA data.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-[var(--foreground)] mb-1">Cookies & tracking</h3>
              <p>
                GameDNA does not use tracking cookies, analytics services, or advertising. The only cookies used
                are for Steam OpenID authentication sessions.
              </p>
            </section>
          </div>
        </div>

        {/* Terms of Use */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <i className="fa-solid fa-file-contract text-[var(--text-muted)]" />
            Terms of Use
          </h2>
          <div className="space-y-4 text-sm text-[var(--text-body)] leading-relaxed">
            <section>
              <h3 className="font-semibold text-[var(--foreground)] mb-1">Acceptance</h3>
              <p>
                By using GameDNA, you agree to these terms. If you do not agree, please do not use the application.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-[var(--foreground)] mb-1">Service description</h3>
              <p>
                GameDNA is a free, open-source game discovery tool. It helps you explore Steam games through
                a swipe interface, builds a taste profile from your decisions, and provides AI-powered recommendations.
                The service is provided "as is" without warranties.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-[var(--foreground)] mb-1">Your responsibilities</h3>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Keep your Steam Web API key confidential and do not share it</li>
                <li>Use the application in compliance with the <a href="https://steamcommunity.com/dev/apiterms" target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] hover:underline">Steam Web API Terms of Use</a></li>
                <li>Do not use the application for unsolicited marketing or to gain unfair competitive advantages in games</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-[var(--foreground)] mb-1">Limitations</h3>
              <p>
                Game recommendations and match scores are algorithmically generated and may not always reflect
                your actual preferences. GameDNA is not responsible for purchasing decisions made based on its recommendations.
              </p>
            </section>
          </div>
        </div>

        {/* API Usage */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <i className="fa-solid fa-gauge-high text-[var(--text-muted)]" />
            Steam API Usage
          </h2>
          <div className="space-y-3 text-sm text-[var(--text-body)] leading-relaxed">
            <p>
              This application respects Steam Web API rate limits. API calls are throttled client-side
              and capped at <strong>100,000 requests per day</strong> per API key, as required by the
              Steam Web API Terms of Use.
            </p>
            <p>
              Game metadata is cached locally for up to 7 days to minimize unnecessary API calls.
            </p>
          </div>
        </div>

        <p className="text-xs text-gray-500 text-center mt-8">
          Last updated: March 2026
        </p>
      </div>
    </div>
  );
}
