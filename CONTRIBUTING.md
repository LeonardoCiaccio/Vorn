# Contributing to Vorn

Thank you for considering a contribution to **Vorn — Vault Of Redundant Nodes**!
Bug reports, feature ideas, documentation fixes, and code contributions are all
welcome.

---

## Contributor License Agreement (required)

Vorn is distributed under a **dual-licensing model**: [AGPL-3.0](LICENSE) for
everyone, plus separate [commercial licenses](COMMERCIAL.md). To keep this model
legally sound, **every contribution requires a signed
[Contributor License Agreement (CLA)](CLA.md)** before it can be merged.

In short, the CLA says:

- **You keep the copyright** on your contribution and can reuse it however you
  like.
- You grant the project the right to distribute your contribution under the
  AGPL-3.0 **and** under commercial license terms.
- In return, the project commits that your contribution will **always remain
  available under the AGPL** — it will never become proprietary-only.

Signing is automatic and takes one minute: when you open your first pull
request, the CLA bot will ask you to post a short comment confirming you agree.
You only sign once; it covers all your future contributions.

If you are contributing on behalf of a company, see the
[Entity Contributions section of the CLA](CLA.md#8-entity-contributions).

**Pull requests cannot be merged until the CLA check passes.**

---

## Reporting bugs

Open an issue and include:

- Vorn version, OS and version (Windows / macOS / Linux)
- Steps to reproduce
- What you expected vs. what happened
- Relevant logs or screenshots, if any

Please search existing issues first to avoid duplicates.

## Suggesting features

Open an issue describing the problem you want solved (not just the solution you
have in mind) and the use case behind it. Small, focused proposals are easier to
evaluate and land.

## Submitting code

1. **Open an issue first** for anything non-trivial, so the approach can be
   discussed before you invest time in it.
2. Fork the repository and create a branch from `master`.
3. Set up the project:

   ```bash
   npm install
   npm run dev
   ```

4. Keep changes focused: one pull request per fix or feature.
5. Match the existing code style and structure of the codebase.
6. Verify the app builds and runs before submitting:

   ```bash
   npm run build
   ```

7. Open the pull request with a clear description of **what** changes and
   **why**. Reference the related issue if there is one.
8. Sign the CLA when the bot asks (first contribution only).

## What to expect

- Your contribution is licensed to the public under the
  [AGPL-3.0](LICENSE), per the CLA.
- Review turnaround may vary — this is an independent project. Pinging after a
  couple of weeks of silence is fine.
- The maintainer may request changes or decline contributions that don't fit
  the project's direction. Discussing in an issue first minimizes this risk.

## Questions

**Leonardo Ciaccio** — leonardo.ciaccio@gmail.com
