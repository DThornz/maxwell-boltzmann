# maxwell-boltzmann

**Maxwell–Boltzmann 2D Gas Simulator** — browser-based educational molecular dynamics simulation.

Part of the [A. Mirza academic tools portfolio](https://dthornz.github.io/website-cv-tools/).

🌐 **Live:** [dthornz.github.io/maxwell-boltzmann](https://dthornz.github.io/maxwell-boltzmann/)

---

Interactive 2D ideal-gas molecular dynamics simulation demonstrating the emergence of the Maxwell–Boltzmann speed distribution from elastic hard-disk collisions.

**Simulator features:**
- Hard-disk elastic collision model with spatial-hash grid O(N) detection (scales to 800 particles at interactive frame rates)
- Speed-colored particle rendering (blue → teal → red by speed)
- Real-time speed histogram (green bars) with exponential running average (red line)
- Theoretical 2D Maxwell–Boltzmann curve (gray dashed) computed from instantaneous temperature
- Adaptive x-axis scaling based on 99th-percentile speed
- Energy controls (± thermal energy), reshuffle, reset, pause

**Educational content:**
- Full mathematical derivation of the 2D distribution from first principles
- Historical background: Maxwell (1860) and Boltzmann (1872)
- Correct characteristic speeds: v_p = √(k_BT/m), ⟨v⟩ = √(πk_BT/2m), v_rms = √(2k_BT/m)
- Equipartition theorem: ⟨KE⟩ = k_BT in 2D
- 6 APA-format references with clickable citation highlighting
- KaTeX-rendered equations

**Tech:** Vanilla HTML/CSS/JS · Canvas API · KaTeX · No build step · GitHub Pages

---

© 2026 Asad Mirza, Ph.D. · Research Assistant Professor · FIU Biomedical Engineering
