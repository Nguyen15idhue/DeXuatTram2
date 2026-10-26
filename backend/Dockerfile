FROM node:20

RUN apt-get update \
    && apt-get install -y --no-install-recommends imagemagick \
    && sample_dir="$(mktemp -d)" \
    && convert -size 2x2 xc:white "$sample_dir/source.png" \
    && for format in jpg png gif webp; do \
        convert "$sample_dir/source.png" "$sample_dir/source.$format" \
        && convert -limit thread 1 "$sample_dir/source.$format[0]" -auto-orient -strip -resize '2048x2048>' 'png:-' > /dev/null || exit 1; \
    done \
    && rm -rf "$sample_dir" /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
