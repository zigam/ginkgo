#!/usr/bin/python
"""
Gingko: find good candidates for international first names.  Pulls in first name databases from
different countries and finds good candidates that match in spelling or pronounciation.

This script imports various first name databases, consolidates and merges them, and outputs a
single JSON file with the metadata.  See data/README for the name databases used.

The goal here is to compile a large list of names, tagged with country, popularity, and phonetic
encoding.  The list can then be used by JavaScript code to find and rank international names.

The output is a dictionary with first names as keys and values consisting of genders with
per-country rankings (with ISO-2 country codes and 1-13 logarithim scale for popularity rank) and
phonetic encodings (double metaphone):
{gender: {country1: ranking1, ...}, metaphone: [enc1, enc2]}

For example:
"George": {"female": {"fr": 1, "us": 1}, "male": {"gb": 8, "us": 8}, "metaphone": ["JRJ", "KRK"]}

This means the name "George" is a less common female name in France and US, and also a very common
male name in UK and US.  The double metaphone phonetic encodings are JRJ and KRK.
"""

import codecs
import json
import math
import os
import re

from collections import defaultdict, OrderedDict
from metaphone import doublemetaphone
from name_parser_maps import COUNTRIES, UNICODE_MAP

import pycountry

MIN_NAMES_PER_COUNTRY = 20

def unicode_name(name):
    """Covert name to unicode."""
    for code, patterns in UNICODE_MAP.items():
        for pat in patterns:
            name = name.replace(pat, chr(code))
    assert name.find('<') == -1, name.encode('utf-8')
    assert name.find('>') == -1, name.encode('utf-8')
    return name

def extract_country_rankings(countries):
    """Extract rankings from line."""
    country_rankings = {}
    assert len(countries) == 55, countries
    for i, ranking in enumerate(countries):
        if ranking == ' ':
            continue
        ranking = ord(bytes.fromhex('0' + ranking).decode('ascii'))
        code = COUNTRIES[i][0]
        if '/' in code:
            codes = code.split('/')
            for code in codes:
                country_rankings[code] = ranking
        else:
            country_rankings[code] = ranking
    return country_rankings

def format_gender(gender):
    """Canonicalize gender string."""
    if gender in ('F', '1F', '?F', 'female'):
        return 'female'
    elif gender in ('M', '1M', '?M', 'male'):
        return 'male'
    elif gender == '?':
        return 'unisex'
    else:
        raise Exception('Invalid gender: ' + gender)

def merge_names_for_country(names_global, country, names_country):
    """Merge list of names for country into global list."""
    for name, values in names_country.items():
        for (gender, ranking) in values:
            merge_name(names_global, name, gender, {country: ranking})

def merge_names(names_global, names_to_merge):
    """Merge list of names into global list."""
    for name, name_dict in names_to_merge.items():
        for gender, country_rankings in name_dict.items():
            merge_name(names_global, name, gender, country_rankings)

def merge_name(names, name, gender, rankings):
    """Merge name into global list."""
    if name not in names or gender not in names[name]:
        names[name][gender] = rankings
        return
    global_rankings = names[name][gender]
    for country, ranking in rankings.items():
        global_rankings[country] = max(ranking, global_rankings.get(country, 0))

def parse_global_names():
    """Parse names from the gender.c database."""
    names = defaultdict(dict)

    for line in codecs.open('../data/gender.c/nam_dict.txt', encoding='iso-8859-1'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        assert len(line) == 87, line.encode('utf-8')
        sorting = line[29]
        if sorting == '+':
            continue

        countries = line[30:-2]
        country_rankings = extract_country_rankings(countries)

        # Ignore East Frisia and "other".
        if 'EF' in country_rankings:
            del country_rankings['EF']
        if 'XX' in country_rankings:
            del country_rankings['XX']
        if not len(country_rankings):
            continue

        name = line[:29]
        gender, name = name.split(' ', 1)
        name = unicode_name(name.strip())
        name = name.replace('+', ' ')

        if gender == '=':
            # Ignore name equivalence.
            continue
        gender = format_gender(gender)
        if gender == 'unisex':
            merge_name(names, name, 'female', country_rankings)
            merge_name(names, name, 'male', country_rankings)
        else:
            merge_name(names, name, gender, country_rankings)

    print('global names: ', len(names))
    return names

def compute_ranking(count, population):
    """Compute ranking for a name with population info."""
    if count <= 0:
        return 1
    pct = 100.0 * float(count) / population
    ranking = 9.0 + math.log(pct, 2)
    ranking = int(round(ranking))
    ranking = min(13, ranking)
    ranking = max(1, ranking)
    return ranking

def parse_wikidata_names():
    """Parse names from the Wikidata query service."""
    names = defaultdict(dict)
    population = defaultdict(int)
    exclude_countries = {'us', 'si', 'in'}

    for gender in 'male', 'female':
        for line in open(f'../data/wikidata/wikidata-names-{gender}.tsv'):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            fields = line.split('\t')
            country, gender, name, count = fields
            if not country or country in exclude_countries:
                continue
            count = int(count)
            population[country] += count
            name = name.strip().title()
            if '.' in name or '/' in name or re.search('[0-9]', name) or count < 2:
                continue
            gender = format_gender(gender)
            country_rankings = {country: count}
            merge_name(names, name, gender, country_rankings)

    print('wikidata names: ', len(names))

    for name, name_dict in names.items():
        for gender, country_rankings in name_dict.items():
            for country, count in country_rankings.items():
                country_rankings[country] = compute_ranking(count, population[country])
    return names

def parse_us_names():
    """Parse names from the SSA database."""
    names = defaultdict(int)
    population = 0
    for root, _, files in os.walk('../data/ssa'):
        for ssa_f in files:
            if ssa_f.startswith('yob') and ssa_f.endswith('.txt'):
                for line in open(os.path.join(root, ssa_f)):
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    name, gender, count = line.split(',')
                    gender = 'female' if gender == 'F' else 'male'
                    count = int(count)
                    if (count < 10):
                        continue
                    population += count
                    names[(name, gender)] += count

    ret = defaultdict(list)
    for (name, gender), count in names.items():
        ranking = compute_ranking(count, population)
        ret[name].append((gender, ranking))
    print('us names: ', len(ret))
    return ret

def parse_si_names():
    """Parse Slovenian names from the si-stat database."""
    name_list = []
    population = 0
    for gender in ('female', 'male'):
        for line in open('../data/si-stat/slovenia-%s-2019.tsv' % gender):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            name, count = line.split('\t')
            if count in ('-', '..'):
                continue
            count = int(count)
            population += count
            name_list.append((name, gender, count))

    names = defaultdict(list)
    for (name, gender, count) in name_list:
        ranking = compute_ranking(count, population)
        names[name].append((gender, ranking))
    print('si names: ', len(names))
    return names

def parse_in_names():
    """Parse Indian names from the mibn database."""
    names = defaultdict(list)
    name_gender_pairs = set()

    for line in open('../misc/data/mibn/names-indian.tsv'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        name, gender, _ = line.split('\t')
        gender = 'female' if gender == 'F' else 'male'
        if (name, gender) in name_gender_pairs:
            continue
        name_gender_pairs.add((name, gender))
        names[name].append((gender, 3))

    print('in names: ', len(names))
    return names

def is_slovenian_name(name_dict):
    """Whether this is a Slovenian name."""
    for _, country_rankings in name_dict.items():
        if 'si' in country_rankings.keys():
            return True

def trimmed_metaphone(name):
    """Return the metaphone for the name."""
    metaphone = doublemetaphone(name.encode('utf-8'))
    if not metaphone[1]:
        metaphone = (metaphone[0],)
    return metaphone

def add_phonetic_encoding(names):
    """Adds adds the phonetic encoding to the name database."""
    for name, name_dict in names.items():
        metaphone = trimmed_metaphone(name)
        if ('j' in name or 'J' in name) and is_slovenian_name(name_dict):
            si_name = name.replace('j', 'y').replace('J', 'Y')
            metaphone += trimmed_metaphone(si_name)
        names[name]['metaphone'] = metaphone

def write_names(names):
    output = open('../data/generated/names.json', 'w')
    json_out = json.dumps(names, indent=None, separators=(', ', ': '), sort_keys=True)
    json_out = json_out.replace('}}, ', '}},\n')
    json_out = json_out.replace(']}, ', ']},\n')
    json_out = json_out.replace('{', '{\n', 1)
    json_out = json_out.replace('}}}', '}}\n}', 1)
    output.write(json_out)
    output.write('\n')
    output.close()

def filter_countries(names, names_in):
    """
    Filter countries where we don't have good data.

    Remove countries with few names.
    Also Remove Sri Lankan names that we haven't found in the Indian database.
    """
    all_countries = set()
    names_per_country_male, names_per_country_female = defaultdict(int), defaultdict(int)
    for _, name_dict in names.items():
        for gender, country_rankings in name_dict.items():
            if gender == 'metaphone':
                continue
            for country, _ in country_rankings.items():
                if not country:
                    continue
                all_countries.add(country)
                if gender == 'male':
                    names_per_country_male[country] += 1
                elif gender == 'female':
                    names_per_country_female[country] += 1

    def filter_country(code):
        return (names_per_country_male[code] >= MIN_NAMES_PER_COUNTRY and
                names_per_country_female[code] >= MIN_NAMES_PER_COUNTRY)

    all_countries = list(filter(filter_country, all_countries))

    for name, name_dict in names.items():
        for gender, country_rankings in name_dict.items():
            if ('lk' in country_rankings and 'in' in country_rankings and
                country_rankings['lk'] == country_rankings['in'] and
                name not in names_in):
                del country_rankings['in']
            for code in list(country_rankings):
                if code not in all_countries:
                    del country_rankings[code]

def write_countries(names):
    output = open('../data/generated/countries.json', 'w')
    f_countries = OrderedDict()

    all_countries = set()
    for _, name_dict in names.items():
        for gender, country_rankings in name_dict.items():
            if gender == 'metaphone':
                continue
            for country, _ in country_rankings.items():
                if not country:
                    continue
                all_countries.add(country)

    for code in all_countries:
        if code == 'AR':
            continue
        country = pycountry.countries.get(alpha_2=code.upper())
        if country:
            f_countries[code] = getattr(country, 'common_name', country.name)
        else:
            print('invalid country code:', code)

    f_countries = OrderedDict(sorted(f_countries.items(), key=lambda x: x[1]))

    print('total countries: ', len(f_countries))
    json_out = json.dumps(f_countries, indent=2, separators=(',', ': '))
    output.write(json_out)
    output.write('\n')
    output.close()


def main():
    """Main."""
    names = parse_global_names()

    names_wikidata = parse_wikidata_names()
    merge_names(names, names_wikidata)

    names_us = parse_us_names()
    merge_names_for_country(names, 'us', names_us)

    names_si = parse_si_names()
    merge_names_for_country(names, 'si', names_si)

    names_in = parse_in_names()
    merge_names_for_country(names, 'in', names_in)

    filter_countries(names, names_in)
    add_phonetic_encoding(names)

    print('total names: ', len(names))

    write_names(names)
    write_countries(names)

if __name__ == '__main__':
    main()
