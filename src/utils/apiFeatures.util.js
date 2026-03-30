class APIFeatures {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
    this.page = 1;
    this.limit = 20;
  }

  search() {
    if (this.queryString.search) {
      this.query = this.query.find({
        $text: { $search: this.queryString.search },
      });
    }
    return this;
  }

  filter() {
    const queryObj = { ...this.queryString };
    const excluded = ["page", "limit", "sort", "fields", "search"];
    excluded.forEach((key) => delete queryObj[key]);

    // Support: ?price[gte]=10&price[lte]=100
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);

    this.query = this.query.find(JSON.parse(queryStr));
    return this;
  }

  sort() {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(",").join(" ");
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort("-createdAt");
    }
    return this;
  }

  paginate() {
    this.page = parseInt(this.queryString.page, 10) || 1;
    this.limit = parseInt(this.queryString.limit, 10) || 20;
    const skip = (this.page - 1) * this.limit;
    this.query = this.query.skip(skip).limit(this.limit);
    return this;
  }
}

module.exports = APIFeatures;
