# An algorithm for naming babies
Give it a try: https://zigam.github.io/ginkgo/

When my wife and I were expecting our first, we faced a daunting task: naming our baby in a way that works across all of our cultures.  My wife was born in India, I was born in Slovenia, and our baby was about to be born the US (which is where we live).  We wanted the baby’s name to be pronounceable and familiar across all of these countries, while also passing the [Starbucks spelling test](https://www.thrillist.com/drink/nation/starbucks-spelling-tumblr-23-hilariously-misspelled-names-on-starbucks-coffee-cups).  Turns out naming is not only a hard problem in computer science.

As we worked our way through various baby naming web sites and suggestions from friends, we would occasionally stumble upon names that seemed to cross cultures: Maya, Ana, Max, etc.  But how do we find an exhaustive list of such universal names to find a name we both like?

We’re both software engineers so we turned this into a data problem: we would need to collect large public datasets of first names with their country of origin, frequency, and optionally gender.  We would filter those lists to our countries of interest (Slovenia, India, and US) and intersect them.  However, we’re not only interested in exact name matches across countries — for example the name Maya is spelled Maja in Slovenian, but pronounced the same as in English.  We still consider this a good name candidate, so we have to take into account pronunciation when intersecting name lists.

The problem can thus be broken down into:

1. **Data sources**: gather large lists of names from curated public sources.  To generalize the problem and solve it for other families too, we’d gather names from all around the world.
2. **Filtering and matching**: filter the list by an arbitrary set of countries and by gender or unisex names.  When intersecting lists, take into account the pronunciation (phonetic encoding) of the name.
3. **Ranking**: rank the results by how strongly they match (exact match or similar pronunciation) and how popular they are in their respective countries.  Ranking allows us to find more common names and exclude spurious matches when the data sources contain unfamiliar names.  It’s important to note that we’re optimizing for recall though: since naming is a very subjective process, we want to generate lots of good candidates.

A few notes:

- We chose country as the unit of localization instead of ethnicity, language, or other units.  This has to do with how the public data sources are annotated.
- Naming a baby is a very personal process.  Some might care about name meaning, history, or gender identity.  We did not set out to solve those problems.
## Data sources

The best sources for first names are generally government statistics departments or census data.  The US Social Security Administration publishes [first names](https://www.ssa.gov/OACT/babynames/background.html) from Social Security card applications since 1880s.  They publish statistics such as Emma and Liam being the most popular baby names in 2018.  But they also provide the raw dataset: 98,400 unique names as of 2018.

There are similar statistical datasets for a handful of other countries (see [references](https://en.wikipedia.org/wiki/List_of_most_popular_given_names#References) for the Wikipedia article on popular names).  However, there are many more countries that either don’t publish such datasets or we weren’t able to find them.

A great [international dataset](https://opendata.stackexchange.com/questions/4756/searching-for-lists-of-babynames-containing-huge-10k-amounts-of-unique-name/4757#4757) was produced by the German computer magazine c’t: 45,371 names across 52 countries (with a focus on European countries), with gender prediction and name popularity.  The list is well curated.

To further expand coverage, we looked to Wikipedia: with its 40M articles across 301 languages, it’s a great resource for extracting names.  Our initial idea was to extract names from wikitext dumps using [Named-entity recognition](https://en.wikipedia.org/wiki/Named-entity_recognition).  However it turns out that Wikipedia’s sister project Wikidata—the multilingual secondary database collecting structured data to provide support for Wikipedia—already contains the data in a useful format.  The following [SPARQL query](https://query.wikidata.org/#%0ASELECT%20%3FnameLabel%20%3Fcount%0AWITH%20%7B%0A%20%20SELECT%20%3Fname%20%28count%28%3Fperson%29%20AS%20%3Fcount%29%20WHERE%20%7B%0A%20%20%20%20%3Fperson%20wdt%3AP735%20%3Fname%20.%20%23%20given%20name%0A%20%20%20%20%3Fperson%20wdt%3AP27%20wd%3AQ215%20.%20%23%20country%3A%20Slovenia%0A%20%20%20%20%3Fperson%20wdt%3AP21%20wd%3AQ6581072%20.%20%23%20sex%20or%20gender%3A%20female%20%0A%20%20%7D%0A%20%20GROUP%20BY%20%3Fname%0A%20%20ORDER%20BY%20DESC%28%3Fcount%29%0A%20%20LIMIT%201000%0A%7D%20AS%20%25results%0AWHERE%20%7B%0A%20%20INCLUDE%20%25results%0A%20%20SERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22%5BAUTO_LANGUAGE%5D%2Cen%22.%20%7D%0A%7D%0AORDER%20BY%20DESC%28%3Fcount%29) will extract Slovenian female names from the knowledge base:


    SELECT ?nameLabel ?count
    WITH {
      SELECT ?name (count(?person) AS ?count) WHERE {
        ?person wdt:P735 ?name . # given name
        ?person wdt:P27 wd:Q215 . # country: Slovenia
        ?person wdt:P21 wd:Q6581072 . # sex or gender: female 
      }
      GROUP BY ?name
      ORDER BY DESC(?count)
      LIMIT 1000
    } AS %results
    WHERE {
      INCLUDE %results
      SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
    }
    ORDER BY DESC(?count)

The entire Wikidata dataset yielded 34,530 unique names across 128 countries!  The dataset is not as well curated as the ones above, but we can use name frequency to exclude spurious entries.  The other problem evident in the Wikiset data is [gender bias](https://suegardner.org/2011/02/19/nine-reasons-why-women-dont-edit-wikipedia-in-their-own-words/): female names represent only 18% of all names!

## Filtering and matching

Filtering the dataset by country and gender is straightforward.  To account for pronunciation matches we used the [Double Metaphone](https://en.wikipedia.org/wiki/Metaphone#Double_Metaphone) phonetic algorithm.  Metaphone is an improved version of the Soundex algorithm, used to index names by sound as pronounced in English.  These algorithms can be used for spell-checking or assisting phone operators in locating a person based on spoken names.

Here’s an example of Metaphone phonetic encoding:

    Karla (common Czech name) → KRL
    Carla (common in the US) → KRL

Since the phonetic encodings match, we can consider the pair (Karla, Carla) a good candidate for a Czech-American name.

Note that while Double Metaphone takes into account spelling differences in some other languages, we expect it to work best for English pronunciation.  This limits its utility in finding similarly-sounding names across only non-English languages.

## Ranking

Finally, we rank the results.  We weigh the results by popularity in their countries and separate exact matches from phonetic matches.  Ranking matters, but our goal is also to produce as many good candidates as possible in hopes of finding *the one*.


<kbd>
  <img src="https://raw.githubusercontent.com/zigam/ginkgo/gh-pages/images/screenshot.png" />
</kbd>

## Results

The final [dataset](https://github.com/zigam/ginkgo/blob/gh-pages/data/generated/names.json) after some cleanup contains:

- **95,095** unique names across **101** countries.
- **386,512** unique (name, gender, country) tuples.

The most international names weighted by popularity are:

- Female: **Maria**, found in 79 countries.
- Male: **David**, found in 94 countries.
- Unisex: **Dominique**, found in 22 countries.

The longest common single-word name is Sri Lankan **Thamotharampillai**.
The most common short name is Vietnamese **My**.

**Brittney** (metaphone encoding: PRTN) can be spelled in at least 44 different ways.

Last but not least: both of our children were successfully named with the help of this tool!
Give it a try: https://zigam.github.io/ginkgo/

