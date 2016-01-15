var l_cache = {};

function levenshtein(s1, s2) {
    if (s1 == s2) {
        return 0;
    } else if (!s1.length) {
        return s2.length;
    } else if (!s2.length) {
        return s1.length;
    } else if (s2 < s1) {
        var tmp = s1;
        s1 = s2;
        s2 = tmp;
    }

    var cache_key = s1 + '|' + s2;
    if (cache_key in l_cache) {
        return l_cache[cache_key];
    }

    var i, j;
    var d = new Array(s1.length + 1);
    for (i = 0; i < s1.length + 1; i++) {
        d[i] = new Array(s2.length + 1);
        for (j = 0; j < s2.length + 1; j++) {
            d[i][j] = 0;
            d[0][j] = j;
        }
        d[i][0] = i;
    }
    for (i = 1; i < s1.length + 1; i++) {
        d[i][0] = i;
    }
    for (j = 1; j < s2.length + 1; j++) {
        d[0][j] = j;
    }
    for (j = 1; j < s2.length + 1; j++) {
        for (i = 1; i < s1.length + 1; i++) {
            if (s1[i - 1] == s2[j - 1]) {
                d[i][j] = d[i - 1][j - 1];
            } else {
                d[i][j] = Math.min(d[i - 1][j] + 1,
                                   d[i][j - 1] + 1,
                                   d[i - 1][j - 1] + 1);
            }
        }
    }
    var dist = d[s1.length][s2.length];
    l_cache[s1 + '|' + s2] = dist;
    return dist;
}

