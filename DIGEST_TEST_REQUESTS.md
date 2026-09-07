# Digest requests for testing

30 ready-to-use, valid digest configurations, prepared on 2026-09-07. These are research requests, not claims that matching papers exist or that a run will return the requested maximum.

## How to use

Each numbered example contains the complete creation payload. Copy the values into the form, or use the JSON as the body of an authenticated `POST /api/v1/digests` request. Each keyword is a separate chip; audience identifiers correspond to the form's multi-select options. Empty arrays mean leave that keyword field blank.

| Payload field | Form field |
| --- | --- |
| `topic` | Digest Topic |
| `description` | Digest Description |
| `include_keywords` | Include Keywords |
| `exclude_keywords` | Exclude Keywords |
| `target_audience` | Target Audience |
| `reporting_from` | Reporting Period — From |
| `reporting_to` | Reporting Period — To |
| `frequency` | Digest Frequency |
| `maximum_papers` | Maximum Papers |

Dates are fixed historical test windows, so they remain valid for future testing. For fresh-paper testing, update the dates together and keep To on or before today. Frequency is a saved preference; it does not automatically change the reporting dates or schedule a run. Creating a digest does not run it: use Run Now explicitly to generate results.

The set covers all five audiences, all four frequencies, single and multiple audience selections, narrow and broad topics, empty keyword lists, maximum-paper values of 1 and 30, and a same-day date range. Example 30 may naturally return no papers; its outcome is not predetermined. All descriptions are within the 300-character limit. These are positive-input examples, not intentionally invalid form submissions.

## 01. AI agents for software engineering

```json
{
  "topic": "AI agents for software engineering",
  "description": "Find studies on agents that plan, implement, and test software changes. Compare task success, human oversight, reproducibility, and limitations on realistic repositories.",
  "include_keywords": [
    "coding agents",
    "software engineering",
    "repository-level evaluation"
  ],
  "exclude_keywords": [
    "marketing",
    "code completion only"
  ],
  "target_audience": [
    "researchers",
    "builders_technical_teams"
  ],
  "reporting_from": "2026-08-24",
  "reporting_to": "2026-09-07",
  "frequency": "weekly",
  "maximum_papers": 20
}
```

## 02. Reliable retrieval-augmented generation

```json
{
  "topic": "Reliable retrieval-augmented generation",
  "description": "Track methods for improving factual accuracy and citation quality in retrieval-augmented generation. Emphasize evaluation, retrieval failures, and evidence-grounded answers.",
  "include_keywords": [
    "retrieval-augmented generation",
    "grounding",
    "citation accuracy"
  ],
  "exclude_keywords": [
    "advertising"
  ],
  "target_audience": [
    "builders_technical_teams",
    "researchers"
  ],
  "reporting_from": "2026-08-24",
  "reporting_to": "2026-09-07",
  "frequency": "weekly",
  "maximum_papers": 15
}
```

## 03. Prompt injection defenses for research assistants

```json
{
  "topic": "Prompt injection defenses for research assistants",
  "description": "Review defenses against instructions hidden in retrieved documents and user inputs. Compare attack assumptions, measured protection, residual risks, and deployment constraints.",
  "include_keywords": [
    "prompt injection",
    "indirect injection",
    "agent security"
  ],
  "exclude_keywords": [
    "image watermarking"
  ],
  "target_audience": [
    "builders_technical_teams"
  ],
  "reporting_from": "2026-09-06",
  "reporting_to": "2026-09-07",
  "frequency": "daily",
  "maximum_papers": 5
}
```

## 04. Efficient small language models

```json
{
  "topic": "Efficient small language models",
  "description": "Identify research on small language models for local deployment. Compare quality, memory requirements, inference speed, quantization, and evaluation methodology.",
  "include_keywords": [
    "small language models",
    "quantization",
    "on-device inference"
  ],
  "exclude_keywords": [
    "cloud-only deployment"
  ],
  "target_audience": [
    "builders_technical_teams",
    "executives_decision_makers"
  ],
  "reporting_from": "2026-08-24",
  "reporting_to": "2026-09-07",
  "frequency": "weekly",
  "maximum_papers": 12
}
```

## 05. AI-assisted project management

```json
{
  "topic": "AI-assisted project management",
  "description": "Find empirical work on AI support for planning, estimation, risk tracking, and reporting in software projects. Distinguish measured team outcomes from proposed frameworks.",
  "include_keywords": [
    "project management",
    "software projects",
    "artificial intelligence"
  ],
  "exclude_keywords": [
    "construction scheduling"
  ],
  "target_audience": [
    "executives_decision_makers",
    "builders_technical_teams"
  ],
  "reporting_from": "2026-08-01",
  "reporting_to": "2026-08-31",
  "frequency": "monthly",
  "maximum_papers": 10
}
```

## 06. Accessible digital learning interfaces

```json
{
  "topic": "Accessible digital learning interfaces",
  "description": "Explore interface design that improves access to digital education for learners with disabilities. Summarize study populations, usability measures, and practical design implications.",
  "include_keywords": [
    "accessibility",
    "digital learning",
    "inclusive design"
  ],
  "exclude_keywords": [
    "commercial product reviews"
  ],
  "target_audience": [
    "builders_technical_teams",
    "science_communicators_educators"
  ],
  "reporting_from": "2026-08-01",
  "reporting_to": "2026-08-31",
  "frequency": "monthly",
  "maximum_papers": 15
}
```

## 07. Post-quantum cryptography deployment

```json
{
  "topic": "Post-quantum cryptography deployment",
  "description": "Review implementation and migration research for post-quantum cryptography. Focus on performance, interoperability, operational tradeoffs, and realistic deployment evaluations.",
  "include_keywords": [
    "post-quantum cryptography",
    "migration",
    "implementation"
  ],
  "exclude_keywords": [
    "cryptocurrency speculation"
  ],
  "target_audience": [
    "builders_technical_teams",
    "executives_decision_makers"
  ],
  "reporting_from": "2026-04-01",
  "reporting_to": "2026-06-30",
  "frequency": "quarterly",
  "maximum_papers": 20
}
```

## 08. Learning-based control for robot manipulation

```json
{
  "topic": "Learning-based control for robot manipulation",
  "description": "Track methods for robots manipulating unfamiliar objects. Compare generalization, data requirements, real-world evaluations, and failures under changing conditions.",
  "include_keywords": [
    "robot manipulation",
    "generalization",
    "robot learning"
  ],
  "exclude_keywords": [
    "autonomous driving"
  ],
  "target_audience": [
    "researchers",
    "builders_technical_teams"
  ],
  "reporting_from": "2026-08-24",
  "reporting_to": "2026-09-07",
  "frequency": "weekly",
  "maximum_papers": 18
}
```

## 09. Gravitational waves from compact binaries

```json
{
  "topic": "Gravitational waves from compact binaries",
  "description": "Summarize observational and methodological research on gravitational waves from merging compact objects. Explain what can be inferred about their populations and where uncertainties remain.",
  "include_keywords": [
    "gravitational waves",
    "compact binaries",
    "population inference"
  ],
  "exclude_keywords": [
    "primordial gravitational waves"
  ],
  "target_audience": [
    "researchers",
    "science_communicators_educators"
  ],
  "reporting_from": "2026-08-01",
  "reporting_to": "2026-08-31",
  "frequency": "monthly",
  "maximum_papers": 20
}
```

## 10. Dark matter detection experiments

```json
{
  "topic": "Dark matter detection experiments",
  "description": "Review experimental searches for dark matter, emphasizing detector sensitivity, background modeling, statistical interpretation, and constraints. Clearly distinguish limits from detection claims.",
  "include_keywords": [
    "dark matter",
    "direct detection",
    "detector backgrounds"
  ],
  "exclude_keywords": [
    "dark energy"
  ],
  "target_audience": [
    "researchers"
  ],
  "reporting_from": "2026-04-01",
  "reporting_to": "2026-06-30",
  "frequency": "quarterly",
  "maximum_papers": 25
}
```

## 11. Exoplanet atmospheres and biosignatures

```json
{
  "topic": "Exoplanet atmospheres and biosignatures",
  "description": "Explain new research on exoplanet atmospheres and possible biosignatures. Distinguish observations from models and discuss alternative explanations and measurement uncertainty.",
  "include_keywords": [
    "exoplanet atmospheres",
    "biosignatures",
    "spectroscopy"
  ],
  "exclude_keywords": [
    "astrology"
  ],
  "target_audience": [
    "science_communicators_educators",
    "general"
  ],
  "reporting_from": "2026-08-01",
  "reporting_to": "2026-08-31",
  "frequency": "monthly",
  "maximum_papers": 12
}
```

## 12. Solar storms and space-weather forecasting

```json
{
  "topic": "Solar storms and space-weather forecasting",
  "description": "Find work on predicting solar eruptions and their effects near Earth. Compare forecast lead times, validation methods, uncertainty, and implications for infrastructure.",
  "include_keywords": [
    "space weather",
    "solar storms",
    "forecasting"
  ],
  "exclude_keywords": [
    "terrestrial weather forecasting"
  ],
  "target_audience": [
    "executives_decision_makers",
    "science_communicators_educators"
  ],
  "reporting_from": "2026-08-24",
  "reporting_to": "2026-09-07",
  "frequency": "weekly",
  "maximum_papers": 10
}
```

## 13. Deep-sea biodiversity monitoring

```json
{
  "topic": "Deep-sea biodiversity monitoring",
  "description": "Explore methods for studying deep-sea species and ecosystems. Compare imaging, environmental DNA, sampling coverage, and limitations in biodiversity estimates.",
  "include_keywords": [
    "deep-sea biodiversity",
    "environmental DNA",
    "ocean monitoring"
  ],
  "exclude_keywords": [
    "freshwater ecosystems"
  ],
  "target_audience": [
    "researchers",
    "science_communicators_educators"
  ],
  "reporting_from": "2026-08-01",
  "reporting_to": "2026-08-31",
  "frequency": "monthly",
  "maximum_papers": 20
}
```

## 14. Marine heatwaves and Mediterranean ecosystems

```json
{
  "topic": "Marine heatwaves and Mediterranean ecosystems",
  "description": "Review evidence on marine heatwaves and ecological responses in the Mediterranean. Focus on study design, regional differences, recovery, and conservation implications.",
  "include_keywords": [
    "marine heatwaves",
    "Mediterranean Sea",
    "ecosystem impacts"
  ],
  "exclude_keywords": [
    "terrestrial heatwaves"
  ],
  "target_audience": [
    "researchers",
    "executives_decision_makers"
  ],
  "reporting_from": "2026-04-01",
  "reporting_to": "2026-06-30",
  "frequency": "quarterly",
  "maximum_papers": 18
}
```

## 15. Ocean carbon removal measurement

```json
{
  "topic": "Ocean carbon removal measurement",
  "description": "Assess research on measuring and verifying ocean-based carbon removal. Emphasize carbon accounting, ecological effects, uncertainty, and monitoring requirements.",
  "include_keywords": [
    "ocean carbon removal",
    "measurement reporting verification",
    "carbon accounting"
  ],
  "exclude_keywords": [
    "corporate press releases"
  ],
  "target_audience": [
    "researchers",
    "executives_decision_makers"
  ],
  "reporting_from": "2026-08-01",
  "reporting_to": "2026-08-31",
  "frequency": "monthly",
  "maximum_papers": 15
}
```

## 16. Microplastics in marine food webs

```json
{
  "topic": "Microplastics in marine food webs",
  "description": "Review how microplastics move through marine food webs. Compare sampling methods and evidence for exposure and effects, without extrapolating beyond the studied species and conditions.",
  "include_keywords": [
    "microplastics",
    "marine food webs",
    "trophic transfer"
  ],
  "exclude_keywords": [
    "freshwater-only studies"
  ],
  "target_audience": [
    "researchers",
    "science_communicators_educators",
    "general"
  ],
  "reporting_from": "2026-08-01",
  "reporting_to": "2026-08-31",
  "frequency": "monthly",
  "maximum_papers": 16
}
```

## 17. Urban heat mitigation in southern Europe

```json
{
  "topic": "Urban heat mitigation in southern Europe",
  "description": "Identify evaluations of trees, shade, reflective materials, and urban design for reducing heat exposure. Focus on southern European cities, field measurements, and equity considerations.",
  "include_keywords": [
    "urban heat",
    "southern Europe",
    "heat mitigation"
  ],
  "exclude_keywords": [
    "indoor air conditioning"
  ],
  "target_audience": [
    "executives_decision_makers",
    "builders_technical_teams"
  ],
  "reporting_from": "2026-04-01",
  "reporting_to": "2026-06-30",
  "frequency": "quarterly",
  "maximum_papers": 20
}
```

## 18. Solid-state battery interfaces

```json
{
  "topic": "Solid-state battery interfaces",
  "description": "Track research on interfaces in solid-state batteries. Compare degradation mechanisms, test conditions, cycle life evidence, and manufacturing implications.",
  "include_keywords": [
    "solid-state batteries",
    "interfaces",
    "degradation"
  ],
  "exclude_keywords": [
    "lead-acid batteries"
  ],
  "target_audience": [
    "researchers",
    "builders_technical_teams"
  ],
  "reporting_from": "2026-08-24",
  "reporting_to": "2026-09-07",
  "frequency": "weekly",
  "maximum_papers": 20
}
```

## 19. Long-duration energy storage

```json
{
  "topic": "Long-duration energy storage",
  "description": "Compare research on storage technologies supporting renewable electricity over long durations. Summarize efficiency, costs, system assumptions, and evidence from demonstrations.",
  "include_keywords": [
    "long-duration energy storage",
    "renewable integration",
    "techno-economic analysis"
  ],
  "exclude_keywords": [
    "portable electronics"
  ],
  "target_audience": [
    "executives_decision_makers",
    "builders_technical_teams"
  ],
  "reporting_from": "2026-08-01",
  "reporting_to": "2026-08-31",
  "frequency": "monthly",
  "maximum_papers": 15
}
```

## 20. Drought resilience in Mediterranean agriculture

```json
{
  "topic": "Drought resilience in Mediterranean agriculture",
  "description": "Review field studies of crop and soil practices that improve drought resilience in Mediterranean environments. Compare water use, yields, ecological tradeoffs, and transferability.",
  "include_keywords": [
    "drought resilience",
    "Mediterranean agriculture",
    "water efficiency"
  ],
  "exclude_keywords": [
    "laboratory-only plant studies"
  ],
  "target_audience": [
    "researchers",
    "executives_decision_makers"
  ],
  "reporting_from": "2026-04-01",
  "reporting_to": "2026-06-30",
  "frequency": "quarterly",
  "maximum_papers": 22
}
```

## 21. Wearable sensors for movement analysis

```json
{
  "topic": "Wearable sensors for movement analysis",
  "description": "Find validation studies of wearable sensors used to assess human movement. Compare accuracy, reference measurements, real-world usability, and sources of bias.",
  "include_keywords": [
    "wearable sensors",
    "movement analysis",
    "validation"
  ],
  "exclude_keywords": [
    "animal tracking"
  ],
  "target_audience": [
    "researchers",
    "builders_technical_teams"
  ],
  "reporting_from": "2026-08-24",
  "reporting_to": "2026-09-07",
  "frequency": "weekly",
  "maximum_papers": 10
}
```

## 22. Motor learning in balance and acrobatics

```json
{
  "topic": "Motor learning in balance and acrobatics",
  "description": "Review research on acquiring balance and complex movement skills. Summarize feedback methods, practice design, retention, transfer, and study limitations without prescribing individual training.",
  "include_keywords": [
    "motor learning",
    "balance",
    "complex movement skills"
  ],
  "exclude_keywords": [
    "injury treatment"
  ],
  "target_audience": [
    "researchers",
    "science_communicators_educators"
  ],
  "reporting_from": "2026-08-01",
  "reporting_to": "2026-08-31",
  "frequency": "monthly",
  "maximum_papers": 12
}
```

## 23. Strength and mobility adaptations in adults

```json
{
  "topic": "Strength and mobility adaptations in adults",
  "description": "Summarize controlled research on resistance training and range-of-motion adaptations in adults. Distinguish population characteristics, intervention details, and measured outcomes.",
  "include_keywords": [
    "resistance training",
    "range of motion",
    "adult participants"
  ],
  "exclude_keywords": [
    "supplement advertising"
  ],
  "target_audience": [
    "science_communicators_educators",
    "general"
  ],
  "reporting_from": "2026-04-01",
  "reporting_to": "2026-06-30",
  "frequency": "quarterly",
  "maximum_papers": 15
}
```

## 24. Sleep and skill consolidation

```json
{
  "topic": "Sleep and skill consolidation",
  "description": "Explore evidence linking sleep to retention of newly learned skills. Compare experimental methods, task types, participant groups, and explanations supported by the results.",
  "include_keywords": [
    "sleep",
    "motor memory",
    "skill consolidation"
  ],
  "exclude_keywords": [
    "sleep medication trials"
  ],
  "target_audience": [
    "researchers",
    "science_communicators_educators"
  ],
  "reporting_from": "2026-08-01",
  "reporting_to": "2026-08-31",
  "frequency": "monthly",
  "maximum_papers": 10
}
```

## 25. Japanese vocabulary learning for beginners

```json
{
  "topic": "Japanese vocabulary learning for beginners",
  "description": "Review evidence on vocabulary acquisition among adult beginners learning Japanese. Compare spaced practice, retrieval practice, reading support, and retention measures.",
  "include_keywords": [
    "Japanese language learning",
    "vocabulary acquisition",
    "adult beginners"
  ],
  "exclude_keywords": [
    "native-speaking children"
  ],
  "target_audience": [
    "science_communicators_educators"
  ],
  "reporting_from": "2026-08-01",
  "reporting_to": "2026-08-31",
  "frequency": "monthly",
  "maximum_papers": 8
}
```

## 26. Technology-assisted pronunciation learning

```json
{
  "topic": "Technology-assisted pronunciation learning",
  "description": "Find studies on speech technology and feedback for second-language pronunciation. Compare learning outcomes, assessment reliability, learner experience, and accessibility.",
  "include_keywords": [
    "pronunciation learning",
    "speech technology",
    "corrective feedback"
  ],
  "exclude_keywords": [
    "voice cloning"
  ],
  "target_audience": [
    "science_communicators_educators",
    "builders_technical_teams"
  ],
  "reporting_from": "2026-08-24",
  "reporting_to": "2026-09-07",
  "frequency": "weekly",
  "maximum_papers": 10
}
```

## 27. Ancient DNA and prehistoric migration

```json
{
  "topic": "Ancient DNA and prehistoric migration",
  "description": "Review research using ancient DNA to investigate prehistoric population movements. Explain evidence, sampling gaps, ethical context, and limits on cultural or historical interpretations.",
  "include_keywords": [
    "ancient DNA",
    "prehistoric migration",
    "population history"
  ],
  "exclude_keywords": [
    "modern ancestry products"
  ],
  "target_audience": [
    "researchers",
    "science_communicators_educators",
    "general"
  ],
  "reporting_from": "2026-04-01",
  "reporting_to": "2026-06-30",
  "frequency": "quarterly",
  "maximum_papers": 20
}
```

## 28. Underwater archaeology and digital documentation

```json
{
  "topic": "Underwater archaeology and digital documentation",
  "description": "Explore methods for documenting submerged archaeological sites. Compare photogrammetry, sonar, mapping accuracy, preservation uses, and practical survey limitations.",
  "include_keywords": [
    "underwater archaeology",
    "photogrammetry",
    "digital documentation"
  ],
  "exclude_keywords": [
    "treasure hunting"
  ],
  "target_audience": [
    "researchers",
    "builders_technical_teams",
    "science_communicators_educators"
  ],
  "reporting_from": "2026-08-01",
  "reporting_to": "2026-08-31",
  "frequency": "monthly",
  "maximum_papers": 14
}
```

## 29. Science communication and public understanding

```json
{
  "topic": "Science communication and public understanding",
  "description": "Find empirical studies on communicating scientific uncertainty to the public. Compare formats, audience responses, comprehension, and trust, including null or mixed findings.",
  "include_keywords": [],
  "exclude_keywords": [],
  "target_audience": [
    "researchers",
    "builders_technical_teams",
    "science_communicators_educators",
    "executives_decision_makers",
    "general"
  ],
  "reporting_from": "2026-08-24",
  "reporting_to": "2026-09-07",
  "frequency": "weekly",
  "maximum_papers": 30
}
```

## 30. One-day scan of gravitational-wave methods

```json
{
  "topic": "One-day scan of gravitational-wave methods",
  "description": "Look for work published during this single day on gravitational-wave data analysis. Return only eligible papers; report an empty result clearly if no suitable work is found.",
  "include_keywords": [
    "gravitational-wave data analysis"
  ],
  "exclude_keywords": [],
  "target_audience": [
    "researchers"
  ],
  "reporting_from": "2026-09-07",
  "reporting_to": "2026-09-07",
  "frequency": "daily",
  "maximum_papers": 1
}
```
