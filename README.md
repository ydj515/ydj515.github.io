# github.io
공부한 것들을 기록합니다.

`Chirpy Jekyll Theme`를 사용하였습니다. 자세한 사항은 [jekyll git repository][jekyllgit], [jekyll docs][docs] 를 참조해주세요.

## wiki
[Wiki][wiki]를 참조하여 작성합니다.

## prerequisite
- mise
- ruby 3.1.6 (managed by `mise.toml`)

## install ruby
The installation process below applies to ARM arch Mac OS.

1. install mise

    ```s
    brew install mise
    ```

2. add mise activation in `~/.zshrc`

    ```sh
    echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
    source ~/.zshrc
    ```

3. trust project config and install ruby

   ```sh
    mise trust
    mise install
   ```

4. install bundler dependencies

    ```sh
    gem install bundler
    bundle install
    ```

## start
```sh
mise run start
```

or

```sh
bundle exec jekyll serve
```

[jekyllgit]: https://github.com/cotes2020/jekyll-theme-chirpy
[wiki]: https://github.com/cotes2020/jekyll-theme-chirpy/wiki
[docs]: https://jekyllrb-ko.github.io/docs/
